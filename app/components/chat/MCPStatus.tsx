import { useState, useEffect } from 'react';
import { createScopedLogger } from '~/utils/logger';
import type { MCPTool } from '~/lib/modules/mcp/config';
import { getMCPBootstrapPromise } from '~/lib/modules/mcp/bootstrap';

const logger = createScopedLogger('MCPStatus');

/**
 * MCP Server status information
 */
interface ServerStatus {
  id: string;
  name: string;
  connected: boolean;
  tools: MCPTool[];
  metadata?: {
    [key: string]: any;
  };
}

/**
 * MCP Status information
 */
interface MCPStatusInfo {
  available: boolean;
  servers: ServerStatus[];
}

/**
 * MCP Status Component
 * Displays the status of MCP servers in the chat interface using the new modular architecture
 */
export function McpStatus() {
  const [mcpStatus, setMcpStatus] = useState<MCPStatusInfo>({
    available: false,
    servers: [],
  });

  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    const checkMcpStatus = async () => {
      try {
        // Get the initialized MCP components
        const { registry } = await getMCPBootstrapPromise();

        // Get all enabled servers
        const servers = registry.getEnabledServers();

        if (servers.length === 0) {
          setMcpStatus({
            available: false,
            servers: [],
          });
          return;
        }

        // Get tools for each server
        const serverStatuses: ServerStatus[] = [];

        for (const server of servers) {
          try {
            // Test connection
            const connectionStatus = await server.testConnection();

            // Get tools if connected
            let tools: MCPTool[] = [];

            if (connectionStatus.success) {
              tools = await server.getToolDefinitions();
            }

            // Add server status
            serverStatuses.push({
              id: server.id,
              name: server.name,
              connected: connectionStatus.success,
              tools,
              metadata:
                server.id === 'github'
                  ? {
                      // For GitHub server, add user info if available
                      user: connectionStatus.message.includes('as ') ? connectionStatus.message.split('as ')[1] : null,
                    }
                  : undefined,
            });
          } catch (error) {
            logger.error(`Error checking status for server ${server.name}:`, error);

            // Add server with disconnected status
            serverStatuses.push({
              id: server.id,
              name: server.name,
              connected: false,
              tools: [],
            });
          }
        }

        setMcpStatus({
          available: serverStatuses.length > 0,
          servers: serverStatuses,
        });
      } catch (error) {
        logger.error('Failed to check MCP status:', error);
        setMcpStatus({
          available: false,
          servers: [],
        });
      }
    };

    // Check status on mount
    checkMcpStatus();

    // Add event listener for manual status checks
    const handleCheckStatus = () => {
      checkMcpStatus();
    };

    window.addEventListener('checkMcpStatus', handleCheckStatus);

    // Check status every 30 seconds
    const intervalId = setInterval(checkMcpStatus, 30000);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('checkMcpStatus', handleCheckStatus);
    };
  }, []);

  // Don't render anything if MCP is not available
  if (!mcpStatus.available) {
    return null;
  }

  const connectedServers = mcpStatus.servers.filter((server) => server.connected);
  const isFullyConnected = connectedServers.length === mcpStatus.servers.length && connectedServers.length > 0;

  return (
    <div
      className="relative flex items-center space-x-2 text-xs bg-bolt-elements-background-depth-1 px-3 py-1.5 rounded-full border border-bolt-elements-borderColor cursor-pointer hover:bg-bolt-elements-background-depth-2 transition-colors"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={() => setShowTooltip(!showTooltip)}
    >
      <div className="flex items-center">
        <div
          className={`w-2 h-2 rounded-full mr-1.5 ${
            isFullyConnected ? 'bg-green-500' : connectedServers.length > 0 ? 'bg-yellow-500' : 'bg-gray-400'
          }`}
        ></div>
        <span className="font-medium">MCP</span>
      </div>

      {/* Show connected server icons */}
      {connectedServers.map((server) => (
        <div className="flex items-center" key={server.id}>
          <div
            className={`
            ${server.id === 'github' ? 'i-ph:github-logo' : 'i-ph:plug-bold'} 
            w-3 h-3 mr-1
          `}
          ></div>
          <span>{server.name}</span>
        </div>
      ))}

      {/* Tooltip with detailed MCP information */}
      {showTooltip && (
        <div className="absolute top-full right-0 mt-2 p-3 bg-bolt-elements-background-depth-2 rounded-md shadow-lg border border-bolt-elements-borderColor z-50 w-64">
          <div className="text-sm font-medium mb-2">MCP Servers Available</div>

          <div className="space-y-2 text-xs">
            {mcpStatus.servers.map((server) => (
              <div className="p-2 bg-bolt-elements-background-depth-1 rounded-md" key={server.id}>
                <div className="flex items-center mb-1">
                  <div
                    className={`w-2 h-2 rounded-full ${server.connected ? 'bg-green-500' : 'bg-red-500'} mr-1.5`}
                  ></div>
                  <span className="font-medium">{server.name}</span>
                </div>
                <div className="text-gray-500 dark:text-gray-400 ml-3.5">
                  {server.connected ? (
                    <>
                      {/* Display metadata (like GitHub user) if available */}
                      {server.metadata?.user && <div>User: {server.metadata.user}</div>}

                      <div className="mt-1">Available Tools:</div>
                      {server.tools.length > 0 ? (
                        <ul className="list-disc ml-4 mt-0.5">
                          {server.tools.map((tool) => (
                            <li key={tool.name}>{tool.name}</li>
                          ))}
                        </ul>
                      ) : (
                        <div className="ml-4 mt-0.5 text-yellow-500">No tools available</div>
                      )}
                    </>
                  ) : (
                    <div className="text-red-500">Not connected</div>
                  )}
                </div>
              </div>
            ))}

            <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              <div className="flex items-center">
                <div className="i-ph:info w-3 h-3 mr-1"></div>
                <span>The LLM is aware of these MCP servers and can use them in responses.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
