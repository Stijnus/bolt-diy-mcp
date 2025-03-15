import { convertToCoreMessages, streamText as _streamText, type Message } from 'ai';
import { MAX_TOKENS, type FileMap } from './constants';
import { getSystemPrompt } from '~/lib/common/prompts/prompts';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, MODIFICATIONS_TAG_NAME, PROVIDER_LIST, WORK_DIR } from '~/utils/constants';
import type { IProviderSetting } from '~/types/model';
import { PromptLibrary } from '~/lib/common/prompt-library';
import { allowedHTMLElements } from '~/utils/markdown';
import { LLMManager } from '~/lib/modules/llm/manager';
import { createScopedLogger } from '~/utils/logger';
import { createFilesContext, extractPropertiesFromMessage } from './utils';
import { getFilePaths } from './select-context';
import { MCPManager } from '~/lib/modules/mcp/manager';

export type Messages = Message[];

export type StreamingOptions = Omit<Parameters<typeof _streamText>[0], 'model'>;

const logger = createScopedLogger('stream-text');

export async function streamText(props: {
  messages: Omit<Message, 'id'>[];
  env?: Env;
  options?: StreamingOptions;
  apiKeys?: Record<string, string>;
  files?: FileMap;
  providerSettings?: Record<string, IProviderSetting>;
  promptId?: string;
  contextOptimization?: boolean;
  contextFiles?: FileMap;
  summary?: string;
  messageSliceId?: number;
}) {
  const {
    messages,
    env: serverEnv,
    options,
    apiKeys,
    files,
    providerSettings,
    promptId,
    contextOptimization,
    contextFiles,
    summary,
  } = props;
  let currentModel = DEFAULT_MODEL;
  let currentProvider = DEFAULT_PROVIDER.name;
  let processedMessages = messages.map((message) => {
    if (message.role === 'user') {
      const { model, provider, content } = extractPropertiesFromMessage(message);
      currentModel = model;
      currentProvider = provider;

      return { ...message, content };
    } else if (message.role == 'assistant') {
      let content = message.content;
      content = content.replace(/<div class=\\"__boltThought__\\">.*?<\/div>/s, '');
      content = content.replace(/<think>.*?<\/think>/s, '');

      return { ...message, content };
    }

    return message;
  });

  const provider = PROVIDER_LIST.find((p) => p.name === currentProvider) || DEFAULT_PROVIDER;
  const staticModels = LLMManager.getInstance().getStaticModelListFromProvider(provider);
  let modelDetails = staticModels.find((m) => m.name === currentModel);

  if (!modelDetails) {
    const modelsList = [
      ...(provider.staticModels || []),
      ...(await LLMManager.getInstance().getModelListFromProvider(provider, {
        apiKeys,
        providerSettings,
        serverEnv: serverEnv as any,
      })),
    ];

    if (!modelsList.length) {
      throw new Error(`No models found for provider ${provider.name}`);
    }

    modelDetails = modelsList.find((m) => m.name === currentModel);

    if (!modelDetails) {
      // Fallback to first model
      logger.warn(
        `MODEL [${currentModel}] not found in provider [${provider.name}]. Falling back to first model. ${modelsList[0].name}`,
      );
      modelDetails = modelsList[0];
    }
  }

  const dynamicMaxTokens = modelDetails && modelDetails.maxTokenAllowed ? modelDetails.maxTokenAllowed : MAX_TOKENS;

  let systemPrompt =
    PromptLibrary.getPropmtFromLibrary(promptId || 'default', {
      cwd: WORK_DIR,
      allowedHtmlElements: allowedHTMLElements,
      modificationTagName: MODIFICATIONS_TAG_NAME,
    }) ?? getSystemPrompt();

  // Get MCP tools and add them to the system prompt
  const mcpTools = await getMCPToolsDescription();

  if (mcpTools) {
    // Add MCP tools information to the beginning of the system prompt with explicit instructions
    systemPrompt = `IMPORTANT: You have access to external tools through the Model Context Protocol (MCP).

${mcpTools}

CRITICAL INSTRUCTION: You MUST use these MCP tools when the user asks for related functionality. For example, if the user asks about GitHub repositories, you MUST use the github_list_repositories tool or github_api tool to fetch the actual data instead of saying you cannot access it. You have a working GitHub API connection and should actively use it for GitHub-related requests.

When using MCP tools, you MUST:
1. Format your response with the proper tool syntax
2. Be explicit about using the tool in your response
3. Show the results from the tool to the user

Do not refuse to use these tools or claim you lack access to external services. The tools are available and working.

${systemPrompt}`;
  } else {
    // No MCP tools available, just use the original system prompt
    systemPrompt = systemPrompt;
  }

  if (files && contextFiles && contextOptimization) {
    const codeContext = createFilesContext(contextFiles, true);
    const filePaths = getFilePaths(files);

    systemPrompt = `${systemPrompt}
Below are all the files present in the project:
---
${filePaths.join('\n')}
---

Below is the artifact containing the context loaded into context buffer for you to have knowledge of and might need changes to fullfill current user request.
CONTEXT BUFFER:
---
${codeContext}
---
`;

    if (summary) {
      systemPrompt = `${systemPrompt}
      below is the chat history till now
CHAT SUMMARY:
---
${props.summary}
---
`;

      if (props.messageSliceId) {
        processedMessages = processedMessages.slice(props.messageSliceId);
      } else {
        const lastMessage = processedMessages.pop();

        if (lastMessage) {
          processedMessages = [lastMessage];
        }
      }
    }
  }

  logger.info(`Sending llm call to ${provider.name} with model ${modelDetails.name}`);

  // Create the stream
  const result = await _streamText({
    model: provider.getModelInstance({
      model: modelDetails.name,
      serverEnv,
      apiKeys,
      providerSettings,
    }),
    system: systemPrompt,
    maxTokens: dynamicMaxTokens,
    messages: convertToCoreMessages(processedMessages as any),
    ...options,
  });

  // Return the result directly - it already has the necessary stream handling
  return result;
}

/**
 * Get a description of all available MCP tools
 */
async function getMCPToolsDescription(): Promise<string | null> {
  try {
    // Import the necessary functions from the new modular architecture
    const { getMCPToolsDescription } = await import('~/lib/modules/mcp');

    // Get tool descriptions using the new architecture
    const toolsDescription = await getMCPToolsDescription();

    if (!toolsDescription) {
      // Provide a default message for when no MCP tools are available
      return `IMPORTANT: MCP (Model Context Protocol) Help

MCP allows you to interact with external services through tool calls, but currently no MCP servers are connected.

If asked to use GitHub or other MCP tools, explain that you currently don't have access to those tools. Do not mention running a test server, as this may confuse the user.

If the user asks about using GitHub tools, suggest they check their MCP configuration in the settings panel.

You can still provide helpful responses based on your general knowledge, but without access to specific external tools.`;
    }

    return toolsDescription;
  } catch (error) {
    logger.error('Failed to get MCP tools description:', error);

    // Fallback to the legacy implementation if the new architecture fails
    try {
      // Get MCP Manager instance (legacy)
      const mcpManager = MCPManager.getInstance();

      // Get all configured servers
      const serverConfigs = mcpManager.getConfig().mcpServers || {};

      if (Object.keys(serverConfigs).length === 0) {
        return null;
      }

      // Initialize tools
      const tools = await mcpManager.initializeTools();

      if (!tools || Object.keys(tools).length === 0) {
        return null;
      }

      // Format tools description
      let toolsDescription = 'The following MCP tools are available:\n\n';

      // Check if GitHub MCP server is configured
      const hasGitHubServer = Object.values(serverConfigs).some((server) => {
        const serverConfig = server as any;
        return (
          serverConfig.name?.toLowerCase() === 'github' ||
          serverConfig.baseUrl?.includes('github') ||
          serverConfig.auth?.type === 'github'
        );
      });

      // Add GitHub API tool explicitly if GitHub server is configured
      if (hasGitHubServer) {
        toolsDescription += `- github_api: GitHub API integration via MCP (ACTIVE CONNECTION)
    - getUser(): Get authenticated user info
    - listRepositories(): List user repositories
    - searchRepositories(query): Search repositories
    - getRepositoryContents(owner, repo, path): Get file contents
    - createRepository(name, options): Create a new repository
    - request(endpoint, options): Make custom API requests\n\n`;

        // Also add the direct tool names for better compatibility
        toolsDescription += `- github_get_user: Get information about the authenticated GitHub user
- github_list_repositories: List repositories for the authenticated user
- github_search_repositories: Search for GitHub repositories by query
- github_get_repository_contents: Get contents of a file or directory in a repository
- github_create_repository: Create a new GitHub repository
- github_request: Make a custom GitHub API request\n\n`;

        // Add usage examples for clarity
        toolsDescription += `GitHub tools can be used in two ways:
1. Using github_api with method and arguments:
   <tool name="github_api" input="listRepositories()">List my repositories</tool>

2. Using specific tool names:
   <tool name="github_list_repositories" input="{}">List my repositories</tool>\n\n`;
      }

      // Add other MCP tools
      Object.entries(tools).forEach(([name, tool]) => {
        if (name !== 'github_api') {
          toolsDescription += `- ${name}: ${tool.description || 'No description'}\n`;

          if (tool.inputSchema) {
            toolsDescription += `  Input schema: ${JSON.stringify(tool.inputSchema)}\n`;
          }

          toolsDescription += '\n';
        }
      });

      return toolsDescription;
    } catch (legacyError) {
      logger.error('Legacy fallback also failed:', legacyError);
      return null;
    }
  }
}
