/*
 * @ts-nocheck
 * Preventing TS checks with files presented in the video for a better presentation.
 */
import { useStore } from '@nanostores/react';
import type { Message } from 'ai';
import { useChat } from 'ai/react';
import { useAnimate } from 'framer-motion';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { cssTransition, toast, ToastContainer } from 'react-toastify';
import { useMessageParser, usePromptEnhancer, useShortcuts, useSnapScroll } from '~/lib/hooks';
import { description, useChatHistory } from '~/lib/persistence';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROMPT_COOKIE_KEY, PROVIDER_LIST } from '~/utils/constants';
import { cubicEasingFn } from '~/utils/easings';
import { createScopedLogger, renderLogger } from '~/utils/logger';
import { BaseChat } from './BaseChat';
import Cookies from 'js-cookie';
import { debounce } from '~/utils/debounce';
import { useSettings } from '~/lib/hooks/useSettings';
import type { ProviderInfo } from '~/types/model';
import { useSearchParams } from '@remix-run/react';
import { createSampler } from '~/utils/sampler';
import { getTemplates, selectStarterTemplate } from '~/utils/selectStarterTemplate';
import { logStore } from '~/lib/stores/logs';
import { streamingState } from '~/lib/stores/streaming';
import { filesToArtifacts } from '~/utils/fileUtils';
import { MCPManager } from '~/lib/modules/mcp/manager';
import { getGitHubMCPClient } from '~/lib/modules/mcp/github';

const toastAnimation = cssTransition({
  enter: 'animated fadeInRight',
  exit: 'animated fadeOutRight',
});

const logger = createScopedLogger('Chat');

export function Chat() {
  renderLogger.trace('Chat');

  const { ready, initialMessages, storeMessageHistory, importChat, exportChat } = useChatHistory();
  const title = useStore(description);
  useEffect(() => {
    workbenchStore.setReloadedMessages(initialMessages.map((m) => m.id));
  }, [initialMessages]);

  return (
    <>
      {ready && (
        <ChatImpl
          description={title}
          initialMessages={initialMessages}
          exportChat={exportChat}
          storeMessageHistory={storeMessageHistory}
          importChat={importChat}
        />
      )}
      <ToastContainer
        closeButton={({ closeToast }) => {
          return (
            <button className="Toastify__close-button" onClick={closeToast}>
              <div className="i-ph:x text-lg" />
            </button>
          );
        }}
        icon={({ type }) => {
          /**
           * @todo Handle more types if we need them. This may require extra color palettes.
           */
          switch (type) {
            case 'success': {
              return <div className="i-ph:check-bold text-bolt-elements-icon-success text-2xl" />;
            }
            case 'error': {
              return <div className="i-ph:warning-circle-bold text-bolt-elements-icon-error text-2xl" />;
            }
          }

          return undefined;
        }}
        position="bottom-right"
        pauseOnFocusLoss
        transition={toastAnimation}
      />
    </>
  );
}

const processSampledMessages = createSampler(
  (options: {
    messages: Message[];
    initialMessages: Message[];
    isLoading: boolean;
    parseMessages: (messages: Message[], isLoading: boolean) => void;
    storeMessageHistory: (messages: Message[]) => Promise<void>;
  }) => {
    const { messages, initialMessages, isLoading, parseMessages, storeMessageHistory } = options;
    parseMessages(messages, isLoading);

    if (messages.length > initialMessages.length) {
      storeMessageHistory(messages).catch((error) => toast.error(error.message));
    }
  },
  50,
);

interface ChatProps {
  initialMessages: Message[];
  storeMessageHistory: (messages: Message[]) => Promise<void>;
  importChat: (description: string, messages: Message[]) => Promise<void>;
  exportChat: () => void;
  description?: string;
}

// Add a function to parse and execute MCP tool calls
const executeMCPToolCall = async (toolCall: string): Promise<string> => {
  try {
    // Extract tool name and input from the tool call
    const nameMatch = toolCall.match(/name="([^"]+)"/);
    const inputMatch = toolCall.match(/input="([^"]+)"/);

    if (!nameMatch || !inputMatch) {
      return 'Error: Invalid tool call format. Expected format: <tool name="tool_name" input="tool input">...</tool>';
    }

    const toolName = nameMatch[1];
    const toolInput = inputMatch[1];

    logger.info(`Executing MCP tool call: ${toolName} with input: ${toolInput}`);

    // Handle GitHub API tool calls
    if (toolName === 'github_api') {
      const githubClient = getGitHubMCPClient();

      if (!githubClient.isAuthenticated()) {
        return 'Error: GitHub client is not authenticated. Please add a valid GitHub token in the MCP Servers tab.';
      }

      // Execute different GitHub API methods based on the input
      switch (toolInput) {
        case 'getUser': {
          const user = await githubClient.getUser();
          return `GitHub User: ${JSON.stringify(user, null, 2)}`;
        }

        case 'listRepositories': {
          const repos = await githubClient.listRepositories();

          // Format repositories for better readability
          if (repos && Array.isArray(repos)) {
            const formattedRepos = repos.map((repo: any, index: number) => {
              return {
                index: index + 1,
                name: repo.name,
                full_name: repo.full_name,
                description: repo.description || 'No description',
                visibility: repo.private ? 'Private' : 'Public',
                stars: repo.stargazers_count,
                forks: repo.forks_count,
                language: repo.language,
                url: repo.html_url,
              };
            });

            return `GitHub Repositories (${repos.length}):\n\n${JSON.stringify(formattedRepos, null, 2)}`;
          }

          return `GitHub Repositories: ${JSON.stringify(repos, null, 2)}`;
        }

        case 'help': {
          // Provide information about available GitHub API methods
          return `
GitHub API Methods:

1. getUser
   - Description: Get information about the authenticated user
   - Usage: <tool name="github_api" input="getUser"></tool>

2. listRepositories
   - Description: List repositories for the authenticated user
   - Usage: <tool name="github_api" input="listRepositories"></tool>

3. searchRepositories
   - Description: Search for repositories by query
   - Usage: <tool name="github_api" input="searchRepositories('query')"></tool>
   - Example: <tool name="github_api" input="searchRepositories('react')"></tool>

4. getRepositoryContents
   - Description: Get contents of a repository
   - Usage: <tool name="github_api" input="getRepositoryContents('owner', 'repo', 'path')"></tool>
   - Example: <tool name="github_api" input="getRepositoryContents('facebook', 'react', 'README.md')"></tool>
`;
        }

        default:
          // Handle more complex inputs with parameters
          if (toolInput.startsWith('searchRepositories(')) {
            const query = toolInput.match(/searchRepositories\(["']([^"']*)["']\)/)?.[1];

            if (query) {
              const results = await githubClient.searchRepositories(query);

              // Format search results for better readability
              if (results && results.items && Array.isArray(results.items)) {
                const formattedResults = results.items.slice(0, 10).map((repo: any, index: number) => {
                  return {
                    index: index + 1,
                    name: repo.full_name,
                    description: repo.description || 'No description',
                    stars: repo.stargazers_count,
                    forks: repo.forks_count,
                    language: repo.language,
                    url: repo.html_url,
                  };
                });

                return `GitHub Search Results for "${query}" (showing top 10 of ${results.total_count}):\n\n${JSON.stringify(formattedResults, null, 2)}`;
              }

              return `GitHub Search Results for "${query}": ${JSON.stringify(results, null, 2)}`;
            }
          } else if (toolInput.startsWith('getRepositoryContents(')) {
            const params = toolInput.match(
              /getRepositoryContents\(["']([^"']*)["'],\s*["']([^"']*)["'](?:,\s*["']([^"']*)["'])?\)/,
            );

            if (params) {
              const owner = params[1];
              const repo = params[2];
              const path = params[3] || '';
              const contents = await githubClient.getRepositoryContents(owner, repo, path);

              return `GitHub Repository Contents for ${owner}/${repo}/${path}: ${JSON.stringify(contents, null, 2)}`;
            }
          }

          return `Error: Unsupported GitHub API method: ${toolInput}. Try <tool name="github_api" input="help"></tool> for available methods.`;
      }
    }

    // Handle other MCP tools
    const mcpManager = MCPManager.getInstance();
    const tools = await mcpManager.initializeTools();

    if (!tools || !tools[toolName]) {
      return `Error: Tool "${toolName}" not found`;
    }

    // Execute the tool
    try {
      const result = await mcpManager.executeTool(toolName, JSON.parse(toolInput));
      return `Tool Result: ${JSON.stringify(result, null, 2)}`;
    } catch (error) {
      return `Error executing tool: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  } catch (error) {
    logger.error('Failed to execute MCP tool call:', error);
    return `Error executing tool call: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
};

// Add a function to process messages for tool calls
const processToolCalls = async (message: string): Promise<string> => {
  // Check if the message contains tool calls
  if (!message.includes('<tool')) {
    return message;
  }

  // Extract tool calls
  const toolCallRegex = /<tool[^>]*>[\s\S]*?<\/tool>/g;
  const toolCalls = message.match(toolCallRegex) || [];

  let processedMessage = message;

  // Process each tool call
  for (const toolCall of toolCalls) {
    const toolResult = await executeMCPToolCall(toolCall);

    // Replace the tool call with the result
    processedMessage = processedMessage.replace(
      toolCall,
      `<div class="mcp-tool-result p-3 my-2 bg-gray-100 dark:bg-gray-800 rounded-md border-l-4 border-purple-500">
        <div class="text-xs text-purple-600 dark:text-purple-400 mb-1 flex items-center">
          <div class="i-ph:plug-bold w-3 h-3 mr-1"></div>
          <span>MCP Tool Result:</span>
        </div>
        <pre class="text-sm overflow-x-auto">${toolResult}</pre>
      </div>`,
    );
  }

  return processedMessage;
};

export const ChatImpl = memo(
  ({ description, initialMessages, storeMessageHistory, importChat, exportChat }: ChatProps) => {
    useShortcuts();

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [chatStarted, setChatStarted] = useState(initialMessages.length > 0);
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
    const [imageDataList, setImageDataList] = useState<string[]>([]);
    const [searchParams, setSearchParams] = useSearchParams();
    const [fakeLoading, setFakeLoading] = useState(false);
    const files = useStore(workbenchStore.files);
    const actionAlert = useStore(workbenchStore.alert);
    const { activeProviders, promptId, autoSelectTemplate, contextOptimizationEnabled } = useSettings();

    const [model, setModel] = useState(() => {
      const savedModel = Cookies.get('selectedModel');
      return savedModel || DEFAULT_MODEL;
    });
    const [provider, setProvider] = useState(() => {
      const savedProvider = Cookies.get('selectedProvider');
      return (PROVIDER_LIST.find((p) => p.name === savedProvider) || DEFAULT_PROVIDER) as ProviderInfo;
    });

    const { showChat } = useStore(chatStore);

    const [animationScope, animate] = useAnimate();

    const [apiKeys, setApiKeys] = useState<Record<string, string>>({});

    const {
      messages,
      isLoading,
      input,
      handleInputChange,
      setInput,
      stop,
      append: originalAppend,
      setMessages,
      reload,
      error,
      data: chatData,
      setData,
    } = useChat({
      api: '/api/chat',
      body: {
        apiKeys,
        files,
        promptId,
        contextOptimization: contextOptimizationEnabled,
      },
      sendExtraMessageFields: true,
      onError: (e) => {
        logger.error('Request failed\n\n', e, error);
        logStore.logError('Chat request failed', e, {
          component: 'Chat',
          action: 'request',
          error: e.message,
        });
        toast.error(
          'There was an error processing your request: ' + (e.message ? e.message : 'No details were returned'),
        );
      },
      onFinish: (message, response) => {
        const usage = response.usage;
        setData(undefined);

        if (usage) {
          console.log('Token usage:', usage);
          logStore.logProvider('Chat response completed', {
            component: 'Chat',
            action: 'response',
            model,
            provider: provider.name,
            usage,
            messageLength: message.content.length,
          });
        }

        logger.debug('Finished streaming');
      },
      initialMessages,
      initialInput: Cookies.get(PROMPT_COOKIE_KEY) || '',
    });

    // Create a wrapped append function that ensures no empty parts are sent
    const append = useCallback(
      (message: any, options?: any) => {
        // If content is an array, ensure no empty parts
        if (message && Array.isArray(message.content)) {
          // Filter out empty text parts and ensure at least one valid part
          const filteredContent = message.content.filter((part: any) => {
            if (part.type === 'text' && (!part.text || part.text.trim() === '')) {
              return false;
            }

            if (part.type === 'image' && !part.image) {
              return false;
            }

            return true;
          });

          // If all parts were filtered out, add a default text part
          if (filteredContent.length === 0) {
            message.content = [{ type: 'text', text: ' ' }]; // Add a space as minimal content
          } else {
            message.content = filteredContent;
          }
        }

        return originalAppend(message, options);
      },
      [originalAppend],
    );

    useEffect(() => {
      const prompt = searchParams.get('prompt');

      // console.log(prompt, searchParams, model, provider);

      if (prompt) {
        setSearchParams({});
        runAnimation();
        append({
          role: 'user',
          content: [
            {
              type: 'text',
              text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${prompt}`,
            },
          ] as any, // Type assertion to bypass compiler check
        });
      }
    }, [model, provider, searchParams]);

    const { enhancingPrompt, promptEnhanced, enhancePrompt, resetEnhancer } = usePromptEnhancer();
    const { parsedMessages, parseMessages: originalParseMessages } = useMessageParser();

    // Override parseMessages to process tool calls
    const parseMessages = useCallback(
      async (messages: Message[], isLoading: boolean) => {
        // First use the original parser
        originalParseMessages(messages, isLoading);

        // Then process tool calls in assistant messages
        for (let i = 0; i < messages.length; i++) {
          const message = messages[i];

          if (
            message.role === 'assistant' &&
            typeof message.content === 'string' &&
            message.content.includes('<tool')
          ) {
            const processedContent = await processToolCalls(message.content);

            // Update the parsed message
            parsedMessages[i] = processedContent;
          }
        }
      },
      [originalParseMessages, parsedMessages],
    );

    // Function to get MCP server information for the LLM
    const getMcpServerInfo = async () => {
      try {
        // Skip local test server check - will use the MCP system directly
        const testServerConnected = false;
        const testServerInfo = '';

        // Check GitHub connection
        const githubClient = getGitHubMCPClient();
        const isAuthenticated = githubClient.isAuthenticated();
        let githubInfo = '';
        let githubUser = null;

        if (isAuthenticated) {
          try {
            // Try to get user info
            githubUser = await githubClient.getUser().catch(() => null);

            if (githubUser && githubUser.login) {
              githubInfo = `GitHub MCP integration is configured and authenticated as user: ${githubUser.login}.
You can use these GitHub API methods through tool calls:
- getUser: Get information about the authenticated user
  Example: <tool name="github_api" input="getUser"></tool>
- listRepositories: List repositories for the authenticated user
  Example: <tool name="github_api" input="listRepositories"></tool>
- searchRepositories: Search for repositories by query
  Example: <tool name="github_api" input="searchRepositories('react')"></tool>
- getRepositoryContents: Get contents of a repository
  Example: <tool name="github_api" input="getRepositoryContents('owner', 'repo', 'path')"></tool>
- help: Show GitHub API help
  Example: <tool name="github_api" input="help"></tool>`;
            } else {
              githubInfo = 'GitHub MCP integration is configured but authentication failed.';
            }
          } catch (error) {
            githubInfo = 'GitHub MCP integration is configured but authentication failed.';
            console.error('Error getting GitHub user:', error);
          }
        }

        // Combine information
        let mcpInfo = '';

        if (testServerConnected || isAuthenticated) {
          mcpInfo = '# Available MCP (Model Context Protocol) Servers\n\n';
          mcpInfo +=
            'You can use these MCP servers to access external services through tool calls in your responses.\n\n';

          if (testServerConnected) {
            mcpInfo += '## MCP Test Server\n\n';
            mcpInfo += `${testServerInfo}\n\n`;
          }

          if (isAuthenticated) {
            mcpInfo += '## GitHub API\n\n';
            mcpInfo += `${githubInfo}\n\n`;
          }

          mcpInfo += '## How to Use MCP Tools\n\n';
          mcpInfo += 'To use an MCP tool in your response, include a tool call using this format:\n\n';
          mcpInfo += '```\n<tool name="tool_name" input="tool_input">...</tool>\n```\n\n';
          mcpInfo += 'The tool call will be executed and the results will be displayed in the chat.\n';
          mcpInfo += "You should proactively suggest using these tools when appropriate for the user's questions.\n";
        }

        return mcpInfo;
      } catch (error) {
        console.error('Error getting MCP server info:', error);
        return '';
      }
    };

    // Function to detect if a message might benefit from MCP tools
    const detectMcpToolOpportunity = async (messageContent: string): Promise<string | null> => {
      try {
        // Check if MCP servers are available
        const mcpInfo = await getMcpServerInfo();

        if (!mcpInfo) {
          return null; // No MCP servers available
        }

        // Check for GitHub-related queries that aren't already handled by special cases
        if (
          messageContent.toLowerCase().includes('github') &&
          !messageContent.toLowerCase().includes('status') &&
          !messageContent.toLowerCase().includes('list') &&
          !messageContent.toLowerCase().includes('show') &&
          !messageContent.toLowerCase().includes('search')
        ) {
          // Check if it's about repositories
          if (
            messageContent.toLowerCase().includes('repo') ||
            messageContent.toLowerCase().includes('project') ||
            messageContent.toLowerCase().includes('code')
          ) {
            return "I notice you're asking about GitHub repositories. I can interact with GitHub using the MCP integration. Would you like me to:\n\n1. List your repositories\n2. Search for repositories\n3. Get repository contents\n\nJust let me know what you'd like to do.";
          }

          // Check if it's about user information
          if (
            messageContent.toLowerCase().includes('user') ||
            messageContent.toLowerCase().includes('profile') ||
            messageContent.toLowerCase().includes('account')
          ) {
            return "I notice you're asking about GitHub user information. I can get information about your GitHub account using the MCP integration. Would you like me to show your GitHub user profile?";
          }
        }

        // Removed test server check for weather as we're using GitHub only

        return null; // No relevant MCP tool opportunity detected
      } catch (error) {
        console.error('Error detecting MCP tool opportunity:', error);
        return null;
      }
    };

    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;

    useEffect(() => {
      chatStore.setKey('started', initialMessages.length > 0);
    }, []);

    useEffect(() => {
      processSampledMessages({
        messages,
        initialMessages,
        isLoading,
        parseMessages,
        storeMessageHistory,
      });
    }, [messages, isLoading, parseMessages]);

    const scrollTextArea = () => {
      const textarea = textareaRef.current;

      if (textarea) {
        textarea.scrollTop = textarea.scrollHeight;
      }
    };

    const abort = () => {
      stop();
      chatStore.setKey('aborted', true);
      workbenchStore.abortAllActions();

      logStore.logProvider('Chat response aborted', {
        component: 'Chat',
        action: 'abort',
        model,
        provider: provider.name,
      });
    };

    useEffect(() => {
      const textarea = textareaRef.current;

      if (textarea) {
        textarea.style.height = 'auto';

        const scrollHeight = textarea.scrollHeight;

        textarea.style.height = `${Math.min(scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
        textarea.style.overflowY = scrollHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
      }
    }, [input, textareaRef]);

    const runAnimation = async () => {
      if (chatStarted) {
        return;
      }

      await Promise.all([
        animate('#examples', { opacity: 0, display: 'none' }, { duration: 0.1 }),
        animate('#intro', { opacity: 0, flex: 1 }, { duration: 0.2, ease: cubicEasingFn }),
      ]);

      chatStore.setKey('started', true);

      setChatStarted(true);
    };

    const sendMessage = async (_event: React.UIEvent, messageInput?: string) => {
      const messageContent = messageInput || input;

      if (!messageContent?.trim()) {
        return;
      }

      if (isLoading) {
        abort();
        return;
      }

      // Special handling for GitHub connection questions
      const isGitHubConnectionQuestion =
        messageContent.toLowerCase().includes('github') &&
        (messageContent.toLowerCase().includes('connected') ||
          messageContent.toLowerCase().includes('connection') ||
          messageContent.toLowerCase().includes('access'));

      // Special handling for GitHub repository listing requests
      const isGitHubRepoListRequest =
        messageContent.toLowerCase().includes('github') &&
        (messageContent.toLowerCase().includes('list') || messageContent.toLowerCase().includes('show')) &&
        messageContent.toLowerCase().includes('repositor');

      // Special handling for GitHub repository search requests
      const isGitHubRepoSearchRequest =
        messageContent.toLowerCase().includes('github') &&
        messageContent.toLowerCase().includes('search') &&
        messageContent.toLowerCase().includes('repositor');

      // Special handling for MCP status check
      const isMcpStatusCheck =
        (messageContent.toLowerCase().includes('mcp') || messageContent.toLowerCase().includes('github')) &&
        (messageContent.toLowerCase().includes('status') ||
          messageContent.toLowerCase().includes('running') ||
          messageContent.toLowerCase().includes('connected') ||
          messageContent.toLowerCase().includes('available') ||
          messageContent.toLowerCase().includes('check'));

      // Special handling for MCP help request
      const isMcpHelpRequest =
        messageContent.toLowerCase().includes('mcp') &&
        (messageContent.toLowerCase().includes('help') ||
          messageContent.toLowerCase().includes('how to use') ||
          messageContent.toLowerCase().includes('what can you do') ||
          messageContent.toLowerCase().includes('capabilities') ||
          messageContent.toLowerCase().includes('commands') ||
          messageContent.toLowerCase().includes('tools'));

      if (isMcpHelpRequest) {
        try {
          // Add the user's question
          append({
            role: 'user',
            content: [
              {
                type: 'text',
                text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${messageContent}`,
              },
              ...imageDataList
                .filter((imageData) => !!imageData)
                .map((imageData) => ({
                  type: 'image',
                  image: imageData,
                })),
            ] as any,
          });

          // Check MCP test server status
          let testServerConnected = false;

          try {
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

          // Check GitHub connection
          const githubClient = getGitHubMCPClient();
          const isAuthenticated = githubClient.isAuthenticated();

          // Prepare help message
          let helpMessage = '# MCP (Model Context Protocol) Help\n\n';
          helpMessage +=
            'MCP allows me to interact with external services through tool calls. Here are the available MCP servers and tools:\n\n';

          // Add information about available MCP servers
          if (testServerConnected || isAuthenticated) {
            if (testServerConnected) {
              helpMessage += '## MCP Test Server\n';
              helpMessage += 'Status: ✅ Running at http://localhost:3001\n';
              helpMessage += 'Available tools:\n';
              helpMessage += '- `hello`: A simple greeting tool\n';
              helpMessage += '  Usage: `<tool name="hello" input=\'{"name":"Your Name"}\'>...</tool>`\n\n';
              helpMessage += '- `calculator`: Perform basic calculations\n';
              helpMessage +=
                '  Usage: `<tool name="calculator" input=\'{"operation":"add", "a":5, "b":3}\'>...</tool>`\n\n';
              helpMessage += '- `weather`: Get weather information\n';
              helpMessage += '  Usage: `<tool name="weather" input=\'{"location":"New York"}\'>...</tool>`\n\n';
            }

            if (isAuthenticated) {
              helpMessage += '## GitHub API\n';
              helpMessage += 'Status: ✅ Authenticated\n';
              helpMessage += 'Available methods:\n\n';
              helpMessage += '- `getUser`: Get information about the authenticated user\n';
              helpMessage += '  Usage: `<tool name="github_api" input="getUser"></tool>`\n\n';
              helpMessage += '- `listRepositories`: List repositories for the authenticated user\n';
              helpMessage += '  Usage: `<tool name="github_api" input="listRepositories"></tool>`\n\n';
              helpMessage += '- `searchRepositories`: Search for repositories by query\n';
              helpMessage += '  Usage: `<tool name="github_api" input="searchRepositories(\'query\')"></tool>`\n\n';
              helpMessage += '- `getRepositoryContents`: Get contents of a repository\n';
              helpMessage +=
                "  Usage: `<tool name=\"github_api\" input=\"getRepositoryContents('owner', 'repo', 'path')\"></tool>`\n\n";
              helpMessage += '- `help`: Show GitHub API help\n';
              helpMessage += '  Usage: `<tool name="github_api" input="help"></tool>`\n\n';
            }
          } else {
            helpMessage += '## No MCP Servers Available\n\n';
            helpMessage += 'There are currently no MCP servers connected. To set up MCP servers:\n\n';
            helpMessage += '1. Start the MCP test server:\n';
            helpMessage += '   ```\n   cd mcp-test-server && npm run simple-server\n   ```\n\n';
            helpMessage +=
              '2. Configure GitHub integration by clicking the MCP button in the header and adding a GitHub token.\n\n';
          }

          helpMessage += '## Example Usage\n\n';
          helpMessage += "To use an MCP tool in my response, I'll include a tool call like this:\n\n";
          helpMessage +=
            '```\nI\'ll check your GitHub repositories:\n\n<tool name="github_api" input="listRepositories"></tool>\n```\n\n';
          helpMessage += 'The tool call will be executed and the results will be displayed in the chat.\n\n';

          // Add the help message
          append({
            role: 'assistant',
            content: helpMessage,
          });

          setInput('');
          Cookies.remove(PROMPT_COOKIE_KEY);
          setUploadedFiles([]);
          setImageDataList([]);
          resetEnhancer();
          textareaRef.current?.blur();

          return;
        } catch (error) {
          console.error('Error providing MCP help:', error);
        }
      }

      if (isMcpStatusCheck) {
        try {
          // Check MCP test server status
          let testServerConnected = false;

          try {
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

          // Check GitHub connection
          const githubClient = getGitHubMCPClient();
          const isAuthenticated = githubClient.isAuthenticated();

          // Add the user's question
          append({
            role: 'user',
            content: [
              {
                type: 'text',
                text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${messageContent}`,
              },
              ...imageDataList
                .filter((imageData) => !!imageData)
                .map((imageData) => ({
                  type: 'image',
                  image: imageData,
                })),
            ] as any,
          });

          // Add a custom response about MCP status with tool call for GitHub
          let statusMessage = '';

          if (testServerConnected) {
            statusMessage += '✅ MCP test server is running at http://localhost:3001\n\n';
          } else {
            statusMessage += '❌ MCP test server is not running\n\n';
          }

          if (isAuthenticated) {
            statusMessage +=
              'Checking GitHub connection status:\n\n<tool name="github_api" input="getUser"></tool>\n\n';
            statusMessage +=
              'You can use GitHub API functions like:\n- Listing repositories\n- Searching repositories\n- Getting repository contents\n';
          } else {
            statusMessage += '❌ GitHub connection is not configured\n\n';
          }

          if (!testServerConnected) {
            statusMessage +=
              'To start the MCP test server, run this command:\n```\ncd mcp-test-server && npm run simple-server\n```\n\n';
          }

          if (!isAuthenticated) {
            statusMessage +=
              'To configure GitHub connection, click the MCP button in the header and set up the GitHub token.';
          }

          append({
            role: 'assistant',
            content: statusMessage,
          });

          setInput('');
          Cookies.remove(PROMPT_COOKIE_KEY);
          setUploadedFiles([]);
          setImageDataList([]);
          resetEnhancer();
          textareaRef.current?.blur();

          return;
        } catch (error) {
          console.error('Error checking MCP status:', error);
        }
      } else if (isGitHubRepoListRequest) {
        // Check if GitHub MCP is configured
        try {
          const githubClient = getGitHubMCPClient();
          const isAuthenticated = githubClient.isAuthenticated();

          if (isAuthenticated) {
            runAnimation();

            // Add the user's question
            append({
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${messageContent}`,
                },

                // Filter out any empty image data
                ...imageDataList
                  .filter((imageData) => !!imageData)
                  .map((imageData) => ({
                    type: 'image',
                    image: imageData,
                  })),
              ] as any,
            });

            // Use the tool call mechanism instead of directly calling the API
            append({
              role: 'assistant',
              content: `I'll list your GitHub repositories using the GitHub API integration.

<tool name="github_api" input="listRepositories">Fetching your GitHub repositories...</tool>

Let me know if you'd like more information about any specific repository.`,
            });

            setInput('');
            Cookies.remove(PROMPT_COOKIE_KEY);
            setUploadedFiles([]);
            setImageDataList([]);
            resetEnhancer();
            textareaRef.current?.blur();

            return;
          }
        } catch (error) {
          // If there's an error checking GitHub connection, continue with normal flow
          console.error('Error checking GitHub repositories:', error);
        }
      } else if (isGitHubConnectionQuestion) {
        // Check if GitHub MCP is configured
        try {
          const githubClient = getGitHubMCPClient();
          const isAuthenticated = githubClient.isAuthenticated();

          if (isAuthenticated) {
            runAnimation();

            // Add the user's question
            append({
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${messageContent}`,
                },
                ...imageDataList.map((imageData) => ({
                  type: 'image',
                  image: imageData,
                })),
              ] as any,
            });

            // Use the tool call mechanism instead of directly calling the API
            append({
              role: 'assistant',
              content: `I'll check our GitHub connection status using the GitHub API integration.

<tool name="github_api" input="getUser"></tool>

I can help you with GitHub-related tasks like:
- Listing your repositories
- Searching for repositories
- Getting repository contents
- Creating repositories

Would you like me to demonstrate by using one of these GitHub API functions?`,
            });

            setInput('');
            Cookies.remove(PROMPT_COOKIE_KEY);
            setUploadedFiles([]);
            setImageDataList([]);
            resetEnhancer();
            textareaRef.current?.blur();

            return;
          }
        } catch (error) {
          // If there's an error checking GitHub connection, continue with normal flow
          console.error('Error checking GitHub connection:', error);
        }
      } else if (isGitHubRepoSearchRequest) {
        // Check if GitHub MCP is configured
        try {
          const githubClient = getGitHubMCPClient();
          const isAuthenticated = githubClient.isAuthenticated();

          if (isAuthenticated) {
            runAnimation();

            // Add the user's question
            append({
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${messageContent}`,
                },
                ...imageDataList.map((imageData) => ({
                  type: 'image',
                  image: imageData,
                })),
              ] as any,
            });

            // Extract search query
            const queryMatch = messageContent.match(
              /search\s+(?:for\s+)?(?:github\s+)?(?:repositories\s+)?(?:about\s+|for\s+|related\s+to\s+)?["']?([^"']+)["']?/i,
            );
            const searchQuery = queryMatch ? queryMatch[1].trim() : 'react';

            // Use the tool call mechanism instead of directly calling the API
            append({
              role: 'assistant',
              content: `I'll search for GitHub repositories related to "${searchQuery}" using the GitHub API integration.

<tool name="github_api" input="searchRepositories('${searchQuery}')"></tool>

Let me know if you'd like to search for something else or get more details about any of these repositories.`,
            });

            setInput('');
            Cookies.remove(PROMPT_COOKIE_KEY);
            setUploadedFiles([]);
            setImageDataList([]);
            resetEnhancer();
            textareaRef.current?.blur();

            return;
          }
        } catch (error) {
          // If there's an error checking GitHub connection, continue with normal flow
          console.error('Error searching GitHub repositories:', error);
        }
      }

      runAnimation();

      if (!chatStarted) {
        setFakeLoading(true);

        if (autoSelectTemplate) {
          const { template, title } = await selectStarterTemplate({
            message: messageContent,
            model,
            provider,
          });

          if (template !== 'blank') {
            const temResp = await getTemplates(template, title).catch((e) => {
              if (e.message.includes('rate limit')) {
                toast.warning('Rate limit exceeded. Skipping starter template\n Continuing with blank template');
              } else {
                toast.warning('Failed to import starter template\n Continuing with blank template');
              }

              return null;
            });

            if (temResp) {
              const { assistantMessage, userMessage } = temResp;
              setMessages([
                {
                  id: `1-${new Date().getTime()}`,
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${messageContent}`,
                    },
                    ...imageDataList.map((imageData) => ({
                      type: 'image',
                      image: imageData,
                    })),
                  ] as any,
                },
                {
                  id: `2-${new Date().getTime()}`,
                  role: 'assistant',
                  content: assistantMessage,
                },
                {
                  id: `3-${new Date().getTime()}`,
                  role: 'user',
                  content: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${userMessage}`,
                  annotations: ['hidden'],
                },
              ]);
              reload();
              setInput('');
              Cookies.remove(PROMPT_COOKIE_KEY);

              setUploadedFiles([]);
              setImageDataList([]);

              resetEnhancer();

              textareaRef.current?.blur();
              setFakeLoading(false);

              return;
            }
          }
        }

        // If autoSelectTemplate is disabled or template selection failed, proceed with normal message
        setMessages([
          {
            id: `${new Date().getTime()}`,
            role: 'user',
            content: [
              {
                type: 'text',
                text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${messageContent}`,
              },
              ...imageDataList.map((imageData) => ({
                type: 'image',
                image: imageData,
              })),
            ] as any,
          },
        ]);
        reload();
        setFakeLoading(false);
        setInput('');
        Cookies.remove(PROMPT_COOKIE_KEY);

        setUploadedFiles([]);
        setImageDataList([]);

        resetEnhancer();

        textareaRef.current?.blur();

        return;
      }

      if (error != null) {
        setMessages(messages.slice(0, -1));
      }

      const modifiedFiles = workbenchStore.getModifiedFiles();

      chatStore.setKey('aborted', false);

      if (modifiedFiles !== undefined) {
        const userUpdateArtifact = filesToArtifacts(modifiedFiles, `${Date.now()}`);
        append({
          role: 'user',
          content: [
            {
              type: 'text',
              text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${userUpdateArtifact}${messageContent}`,
            },
            ...imageDataList.map((imageData) => ({
              type: 'image',
              image: imageData,
            })),
          ] as any,
        });

        workbenchStore.resetAllFileModifications();
      } else {
        // Get MCP server information to include in the system message
        const mcpInfo = await getMcpServerInfo();

        // If MCP servers are available, include a system message with MCP info
        if (mcpInfo) {
          // Always include MCP info as a system message at the beginning of a conversation
          if (messages.length === 0) {
            append({
              role: 'system',
              content: `${mcpInfo}`,
            });
          }
        }

        // Check if this message might benefit from MCP tools
        const mcpToolSuggestion = await detectMcpToolOpportunity(messageContent);

        // SPECIAL HANDLING: If the message asks about GitHub repositories, force a direct response
        if (messageContent.toLowerCase().includes('github') && messageContent.toLowerCase().includes('repo')) {
          console.log('Detected GitHub repository request - using direct tool call');

          // Add user message
          append({
            role: 'user',
            content: [
              {
                type: 'text',
                text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${messageContent}`,
              },
              ...imageDataList.map((imageData) => ({
                type: 'image',
                image: imageData,
              })),
            ] as any,
          });

          // Add assistant response with GitHub tool
          append({
            role: 'assistant',
            content: `I'll fetch your GitHub repositories:

<tool name="github_api" input="listRepositories">Fetching your GitHub repositories...</tool>`,
          });

          setInput('');
          Cookies.remove(PROMPT_COOKIE_KEY);
          setUploadedFiles([]);
          setImageDataList([]);
          resetEnhancer();
          textareaRef.current?.blur();

          return;
        }

        append({
          role: 'user',
          content: [
            {
              type: 'text',
              text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${messageContent}`,
            },
            ...imageDataList.map((imageData) => ({
              type: 'image',
              image: imageData,
            })),
          ] as any,
        });

        // If there's a relevant MCP tool suggestion and this isn't a special case already handled
        if (
          mcpToolSuggestion &&
          !isGitHubRepoListRequest &&
          !isGitHubRepoSearchRequest &&
          !isGitHubConnectionQuestion &&
          !isMcpStatusCheck &&
          !isMcpHelpRequest
        ) {
          append({
            role: 'assistant',
            content: mcpToolSuggestion,
          });

          setInput('');
          Cookies.remove(PROMPT_COOKIE_KEY);
          setUploadedFiles([]);
          setImageDataList([]);
          resetEnhancer();
          textareaRef.current?.blur();

          return;
        }
      }

      setInput('');
      Cookies.remove(PROMPT_COOKIE_KEY);

      setUploadedFiles([]);
      setImageDataList([]);

      resetEnhancer();

      textareaRef.current?.blur();
    };

    /**
     * Handles the change event for the textarea and updates the input state.
     * @param event - The change event from the textarea.
     */
    const onTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      handleInputChange(event);
    };

    /**
     * Debounced function to cache the prompt in cookies.
     * Caches the trimmed value of the textarea input after a delay to optimize performance.
     */
    const debouncedCachePrompt = useCallback(
      debounce((event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const trimmedValue = event.target.value.trim();
        Cookies.set(PROMPT_COOKIE_KEY, trimmedValue, { expires: 30 });
      }, 1000),
      [],
    );

    const [messageRef, scrollRef] = useSnapScroll();

    useEffect(() => {
      const storedApiKeys = Cookies.get('apiKeys');

      if (storedApiKeys) {
        setApiKeys(JSON.parse(storedApiKeys));
      }
    }, []);

    const handleModelChange = (newModel: string) => {
      setModel(newModel);
      Cookies.set('selectedModel', newModel, { expires: 30 });
    };

    const handleProviderChange = (newProvider: ProviderInfo) => {
      setProvider(newProvider);
      Cookies.set('selectedProvider', newProvider.name, { expires: 30 });
    };

    return (
      <BaseChat
        ref={animationScope}
        textareaRef={textareaRef}
        input={input}
        showChat={showChat}
        chatStarted={chatStarted}
        isStreaming={isLoading || fakeLoading}
        onStreamingChange={(streaming) => {
          streamingState.set(streaming);
        }}
        enhancingPrompt={enhancingPrompt}
        promptEnhanced={promptEnhanced}
        sendMessage={sendMessage}
        model={model}
        setModel={handleModelChange}
        provider={provider}
        setProvider={handleProviderChange}
        providerList={activeProviders}
        messageRef={messageRef}
        scrollRef={scrollRef}
        handleInputChange={(e) => {
          onTextareaChange(e);
          debouncedCachePrompt(e);
        }}
        handleStop={abort}
        description={description}
        importChat={importChat}
        exportChat={exportChat}
        messages={messages.map((message, i) => {
          if (message.role === 'user') {
            return message;
          }

          return {
            ...message,
            content: parsedMessages[i] || '',
          };
        })}
        enhancePrompt={() => {
          enhancePrompt(
            input,
            (input) => {
              setInput(input);
              scrollTextArea();
            },
            model,
            provider,
            apiKeys,
          );
        }}
        uploadedFiles={uploadedFiles}
        setUploadedFiles={setUploadedFiles}
        imageDataList={imageDataList}
        setImageDataList={setImageDataList}
        actionAlert={actionAlert}
        clearAlert={() => workbenchStore.clearAlert()}
        data={chatData}
      />
    );
  },
);
