import { useStore } from '@nanostores/react';
import { toast } from 'react-toastify';
import useViewport from '~/lib/hooks';
import { chatStore } from '~/lib/stores/chat';
import { netlifyConnection } from '~/lib/stores/netlify';
import { workbenchStore } from '~/lib/stores/workbench';
import { webcontainer } from '~/lib/webcontainer';
import { classNames } from '~/utils/classNames';
import { path } from '~/utils/path';
import { useEffect, useRef, useState } from 'react';
import type { ActionCallbackData } from '~/lib/runtime/message-parser';
import { chatId } from '~/lib/persistence/useChatHistory'; // Add this import
import { streamingState } from '~/lib/stores/streaming';
import { NetlifyDeploymentLink } from '~/components/chat/NetlifyDeploymentLink.client';

interface HeaderActionButtonsProps {}

export function HeaderActionButtons({}: HeaderActionButtonsProps) {
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const { showChat } = useStore(chatStore);
  const connection = useStore(netlifyConnection);
  const [activePreviewIndex] = useState(0);
  const previews = useStore(workbenchStore.previews);
  const activePreview = previews[activePreviewIndex];
  const [isDeploying, setIsDeploying] = useState(false);
  const isSmallViewport = useViewport(1024);
  const canHideChat = showWorkbench || !showChat;
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isStreaming = useStore(streamingState);

  // Add state for MCP setup
  const [isMcpSetupOpen, setIsMcpSetupOpen] = useState(false);
  const [mcpSetupStatus, setMcpSetupStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const mcpSetupRef = useRef<HTMLDivElement>(null);

  // Add state for MCP status
  const [mcpStatus, setMcpStatus] = useState<{
    available: boolean;
    githubConnected: boolean;
    testServerConnected: boolean;
  }>({
    available: false,
    githubConnected: false,
    testServerConnected: false,
  });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }

      if (mcpSetupRef.current && !mcpSetupRef.current.contains(event.target as Node)) {
        setIsMcpSetupOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentChatId = useStore(chatId);

  // Check MCP status on component mount and when setup changes
  useEffect(() => {
    const checkMcpStatus = async () => {
      try {
        // Check if MCP servers are configured in localStorage
        const storedServersJson = localStorage.getItem('mcp_servers');

        if (!storedServersJson) {
          setMcpStatus({
            available: false,
            githubConnected: false,
            testServerConnected: false,
          });
          return;
        }

        // Parse stored servers
        const storedServers = JSON.parse(storedServersJson);

        if (!Array.isArray(storedServers) || storedServers.length === 0) {
          setMcpStatus({
            available: false,
            githubConnected: false,
            testServerConnected: false,
          });
          return;
        }

        // Check if test server is running
        let testServerConnected = false;

        try {
          // Create an abort controller with timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1000);

          const testResponse = await fetch('http://localhost:3001/', {
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          testServerConnected = testResponse.ok;
        } catch (error) {
          console.log('Test server not running:', error);
        }

        // Check GitHub token
        let githubConnected = false;
        const githubServer = storedServers.find((server) => server.name.toLowerCase() === 'github');

        if (githubServer && githubServer.auth && githubServer.auth.token) {
          try {
            // Create an abort controller with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1000);

            const githubResponse = await fetch('https://api.github.com/user', {
              headers: {
                Authorization: `token ${githubServer.auth.token}`,
              },
              signal: controller.signal,
            });

            clearTimeout(timeoutId);
            githubConnected = githubResponse.ok;
          } catch (error) {
            console.log('GitHub API error:', error);
          }
        }

        setMcpStatus({
          available: true,
          githubConnected,
          testServerConnected,
        });
      } catch (error) {
        console.error('Failed to check MCP status:', error);
        setMcpStatus({
          available: false,
          githubConnected: false,
          testServerConnected: false,
        });
      }
    };

    checkMcpStatus();

    // Check status every 30 seconds
    const intervalId = setInterval(checkMcpStatus, 30000);

    return () => clearInterval(intervalId);
  }, [mcpSetupStatus]);

  const handleDeploy = async () => {
    if (!connection.user || !connection.token) {
      toast.error('Please connect to Netlify first in the settings tab!');
      return;
    }

    if (!currentChatId) {
      toast.error('No active chat found');
      return;
    }

    try {
      setIsDeploying(true);

      const artifact = workbenchStore.firstArtifact;

      if (!artifact) {
        throw new Error('No active project found');
      }

      const actionId = 'build-' + Date.now();
      const actionData: ActionCallbackData = {
        messageId: 'netlify build',
        artifactId: artifact.id,
        actionId,
        action: {
          type: 'build' as const,
          content: 'npm run build',
        },
      };

      // Add the action first
      artifact.runner.addAction(actionData);

      // Then run it
      await artifact.runner.runAction(actionData);

      if (!artifact.runner.buildOutput) {
        throw new Error('Build failed');
      }

      // Get the build files
      const container = await webcontainer;

      // Remove /home/project from buildPath if it exists
      const buildPath = artifact.runner.buildOutput.path.replace('/home/project', '');

      // Get all files recursively
      async function getAllFiles(dirPath: string): Promise<Record<string, string>> {
        const files: Record<string, string> = {};
        const entries = await container.fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);

          if (entry.isFile()) {
            const content = await container.fs.readFile(fullPath, 'utf-8');

            // Remove /dist prefix from the path
            const deployPath = fullPath.replace(buildPath, '');
            files[deployPath] = content;
          } else if (entry.isDirectory()) {
            const subFiles = await getAllFiles(fullPath);
            Object.assign(files, subFiles);
          }
        }

        return files;
      }

      const fileContents = await getAllFiles(buildPath);

      // Use chatId instead of artifact.id
      const existingSiteId = localStorage.getItem(`netlify-site-${currentChatId}`);

      // Deploy using the API route with file contents
      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          siteId: existingSiteId || undefined,
          files: fileContents,
          token: connection.token,
          chatId: currentChatId, // Use chatId instead of artifact.id
        }),
      });

      const data = (await response.json()) as any;

      if (!response.ok || !data.deploy || !data.site) {
        console.error('Invalid deploy response:', data);
        throw new Error(data.error || 'Invalid deployment response');
      }

      // Poll for deployment status
      const maxAttempts = 20; // 2 minutes timeout
      let attempts = 0;
      let deploymentStatus;

      while (attempts < maxAttempts) {
        try {
          const statusResponse = await fetch(
            `https://api.netlify.com/api/v1/sites/${data.site.id}/deploys/${data.deploy.id}`,
            {
              headers: {
                Authorization: `Bearer ${connection.token}`,
              },
            },
          );

          deploymentStatus = (await statusResponse.json()) as any;

          if (deploymentStatus.state === 'ready' || deploymentStatus.state === 'uploaded') {
            break;
          }

          if (deploymentStatus.state === 'error') {
            throw new Error('Deployment failed: ' + (deploymentStatus.error_message || 'Unknown error'));
          }

          attempts++;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          console.error('Status check error:', error);
          attempts++;
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      if (attempts >= maxAttempts) {
        throw new Error('Deployment timed out');
      }

      // Store the site ID if it's a new site
      if (data.site) {
        localStorage.setItem(`netlify-site-${currentChatId}`, data.site.id);
      }

      toast.success(
        <div>
          Deployed successfully!{' '}
          <a
            href={deploymentStatus.ssl_url || deploymentStatus.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View site
          </a>
        </div>,
      );
    } catch (error) {
      console.error('Deploy error:', error);
      toast.error(error instanceof Error ? error.message : 'Deployment failed');
    } finally {
      setIsDeploying(false);
    }
  };

  // Add function to set up MCP servers
  const setupMcpServers = () => {
    try {
      // MCP Server Configuration
      const MCP_SERVERS = [
        {
          name: 'test',
          baseUrl: 'http://localhost:3001/sse',
          enabled: true,
        },
        {
          name: 'github',
          baseUrl: 'https://api.github.com',
          enabled: true,
          auth: {
            // Try to get token from environment variables
            token: import.meta.env.VITE_GITHUB_ACCESS_TOKEN || '',
            type: 'github',
          },
        },
      ];

      // Save to localStorage
      localStorage.setItem('mcp_servers', JSON.stringify(MCP_SERVERS));

      // Set success status
      setMcpSetupStatus('success');

      // Auto-close after 3 seconds
      setTimeout(() => {
        setMcpSetupStatus('idle');
        setIsMcpSetupOpen(false);
      }, 3000);

      return true;
    } catch (error) {
      console.error('Failed to set up MCP servers:', error);
      setMcpSetupStatus('error');

      return false;
    }
  };

  // Add function to reset MCP configuration
  const resetMcpConfig = () => {
    try {
      // Remove MCP configuration from localStorage
      localStorage.removeItem('mcp_servers');

      // Set success status
      toast.success('MCP configuration has been reset');

      // Trigger a status check
      const event = new Event('checkMcpStatus');
      window.dispatchEvent(event);

      return true;
    } catch (error) {
      console.error('Failed to reset MCP configuration:', error);
      toast.error('Failed to reset MCP configuration');

      return false;
    }
  };

  // Add function to start the MCP test server
  const startMcpTestServer = async () => {
    try {
      // Set loading state
      setMcpSetupStatus('idle');

      // Make a request to start the server
      const response = await fetch('/api/start-mcp-server', {
        method: 'POST',
      });

      if (response.ok) {
        // Server started successfully
        toast.success('MCP test server started successfully');

        // Wait a moment and then check the status
        setTimeout(() => {
          // Trigger a status check
          const event = new Event('checkMcpStatus');
          window.dispatchEvent(event);
        }, 1000);

        return true;
      } else {
        // Server failed to start
        const errorData = (await response.json()) as { error?: string };
        toast.error(`Failed to start MCP test server: ${errorData.error || 'Unknown error'}`);

        return false;
      }
    } catch (error) {
      console.error('Failed to start MCP test server:', error);
      toast.error('Failed to start MCP test server. Please start it manually.');

      return false;
    }
  };

  return (
    <div className="flex">
      {/* Add MCP Setup Button with Status Indicator */}
      <div className="relative mr-2" ref={mcpSetupRef}>
        <div className="flex border border-bolt-elements-borderColor rounded-md overflow-hidden text-sm">
          <Button
            active={mcpStatus.available}
            onClick={() => setIsMcpSetupOpen(!isMcpSetupOpen)}
            className="px-4 hover:bg-bolt-elements-item-backgroundActive flex items-center gap-2"
          >
            <div className="relative">
              <div className="i-ph:plug-bold w-4 h-4" />
              {mcpStatus.available && (
                <div
                  className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${mcpStatus.testServerConnected && mcpStatus.githubConnected ? 'bg-green-500' : 'bg-yellow-500'}`}
                ></div>
              )}
            </div>
            MCP
          </Button>
        </div>

        {isMcpSetupOpen && (
          <div className="absolute right-0 flex flex-col gap-1 z-50 p-4 mt-1 min-w-[20rem] bg-bolt-elements-background-depth-2 rounded-md shadow-lg bg-bolt-elements-backgroundDefault border border-bolt-elements-borderColor">
            <h3 className="text-lg font-semibold mb-2">MCP Setup</h3>

            {/* MCP Status Section */}
            {mcpStatus.available && (
              <div className="mb-4">
                <h4 className="text-sm font-medium mb-2">MCP Status</h4>
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex items-center">
                    <div
                      className={`w-2 h-2 rounded-full mr-2 ${mcpStatus.testServerConnected ? 'bg-green-500' : 'bg-red-500'}`}
                    ></div>
                    <span>Test Server: {mcpStatus.testServerConnected ? 'Connected' : 'Not Connected'}</span>
                    {!mcpStatus.testServerConnected && (
                      <Button active onClick={startMcpTestServer} className="ml-2 py-1 px-2 text-xs">
                        Start Server
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center">
                    <div
                      className={`w-2 h-2 rounded-full mr-2 ${mcpStatus.githubConnected ? 'bg-green-500' : 'bg-red-500'}`}
                    ></div>
                    <span>GitHub API: {mcpStatus.githubConnected ? 'Connected' : 'Not Connected'}</span>
                  </div>
                </div>
              </div>
            )}

            <p className="text-sm mb-4">
              This will automatically configure the MCP servers in your browser's localStorage.
            </p>

            {mcpSetupStatus === 'success' ? (
              <div className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 p-3 rounded-md mb-4 flex items-center">
                <div className="i-ph:check-circle-bold w-5 h-5 mr-2" />
                MCP servers configured successfully! Please refresh the page.
              </div>
            ) : mcpSetupStatus === 'error' ? (
              <div className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 p-3 rounded-md mb-4 flex items-center">
                <div className="i-ph:x-circle-bold w-5 h-5 mr-2" />
                Failed to configure MCP servers. Please try again.
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <Button active onClick={setupMcpServers} className="w-full py-2 justify-center">
                <div className="i-ph:lightning-bold w-4 h-4 mr-2" />
                Set Up MCP Servers
              </Button>

              <Button
                onClick={resetMcpConfig}
                className="w-full py-2 justify-center bg-red-500 hover:bg-red-600 text-white"
              >
                <div className="i-ph:trash-bold w-4 h-4 mr-2" />
                Reset MCP Configuration
              </Button>

              <div className="text-xs text-bolt-elements-textTertiary mt-2">
                <strong>Note:</strong> Make sure the MCP test server is running:
                <pre className="bg-bolt-elements-background-depth-3 p-2 rounded mt-1 overflow-x-auto">
                  cd mcp-test-server && npm run simple-server
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="relative" ref={dropdownRef}>
        <div className="flex border border-bolt-elements-borderColor rounded-md overflow-hidden mr-2 text-sm">
          <Button
            active
            disabled={isDeploying || !activePreview || isStreaming}
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="px-4 hover:bg-bolt-elements-item-backgroundActive flex items-center gap-2"
          >
            {isDeploying ? 'Deploying...' : 'Deploy'}
            <div
              className={classNames('i-ph:caret-down w-4 h-4 transition-transform', isDropdownOpen ? 'rotate-180' : '')}
            />
          </Button>
        </div>

        {isDropdownOpen && (
          <div className="absolute right-2 flex flex-col gap-1 z-50 p-1 mt-1 min-w-[13.5rem] bg-bolt-elements-background-depth-2 rounded-md shadow-lg bg-bolt-elements-backgroundDefault border border-bolt-elements-borderColor">
            <Button
              active
              onClick={() => {
                handleDeploy();
                setIsDropdownOpen(false);
              }}
              disabled={isDeploying || !activePreview || !connection.user}
              className="flex items-center w-full px-4 py-2 text-sm text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive gap-2 rounded-md group relative"
            >
              <img
                className="w-5 h-5"
                height="24"
                width="24"
                crossOrigin="anonymous"
                src="https://cdn.simpleicons.org/netlify"
              />
              <span className="mx-auto">{!connection.user ? 'No Account Connected' : 'Deploy to Netlify'}</span>
              {connection.user && <NetlifyDeploymentLink />}
            </Button>
            <Button
              active={false}
              disabled
              className="flex items-center w-full rounded-md px-4 py-2 text-sm text-bolt-elements-textTertiary gap-2"
            >
              <span className="sr-only">Coming Soon</span>
              <img
                className="w-5 h-5 bg-black p-1 rounded"
                height="24"
                width="24"
                crossOrigin="anonymous"
                src="https://cdn.simpleicons.org/vercel/white"
                alt="vercel"
              />
              <span className="mx-auto">Deploy to Vercel (Coming Soon)</span>
            </Button>
            <Button
              active={false}
              disabled
              className="flex items-center w-full rounded-md px-4 py-2 text-sm text-bolt-elements-textTertiary gap-2"
            >
              <span className="sr-only">Coming Soon</span>
              <img
                className="w-5 h-5"
                height="24"
                width="24"
                crossOrigin="anonymous"
                src="https://cdn.simpleicons.org/cloudflare"
                alt="vercel"
              />
              <span className="mx-auto">Deploy to Cloudflare (Coming Soon)</span>
            </Button>
          </div>
        )}
      </div>
      <div className="flex border border-bolt-elements-borderColor rounded-md overflow-hidden">
        <Button
          active={showChat}
          disabled={!canHideChat || isSmallViewport} // expand button is disabled on mobile as it's not needed
          onClick={() => {
            if (canHideChat) {
              chatStore.setKey('showChat', !showChat);
            }
          }}
        >
          <div className="i-bolt:chat text-sm" />
        </Button>
        <div className="w-[1px] bg-bolt-elements-borderColor" />
        <Button
          active={showWorkbench}
          onClick={() => {
            if (showWorkbench && !showChat) {
              chatStore.setKey('showChat', true);
            }

            workbenchStore.showWorkbench.set(!showWorkbench);
          }}
        >
          <div className="i-ph:code-bold" />
        </Button>
      </div>
    </div>
  );
}

interface ButtonProps {
  active?: boolean;
  disabled?: boolean;
  children?: any;
  onClick?: VoidFunction;
  className?: string;
}

function Button({ active = false, disabled = false, children, onClick, className }: ButtonProps) {
  return (
    <button
      className={classNames(
        'flex items-center p-1.5',
        {
          'bg-bolt-elements-item-backgroundDefault hover:bg-bolt-elements-item-backgroundActive text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary':
            !active,
          'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent': active && !disabled,
          'bg-bolt-elements-item-backgroundDefault text-alpha-gray-20 dark:text-alpha-white-20 cursor-not-allowed':
            disabled,
        },
        className,
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
