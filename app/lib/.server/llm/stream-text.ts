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
    // Add MCP tools information to the beginning of the system prompt
    systemPrompt = `IMPORTANT: You have access to external tools through the Model Context Protocol (MCP).

${mcpTools}

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

  // Import MCP tool handler
  const { processToolCalls } = await import('~/lib/modules/mcp');

  // Create the stream
  const stream = await _streamText({
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

  // Create a new stream that will post-process LLM responses for MCP tool calls
  const processedStream = stream.pipeThrough(
    new TransformStream({
      transform: async (chunk, controller) => {
        // Pass through non-text chunks
        if (typeof chunk !== 'string') {
          controller.enqueue(chunk);
          return;
        }

        try {
          // Check if the chunk might contain a tool call
          if (chunk.includes('<tool') && chunk.includes('</tool>')) {
            // Process tool calls in the chunk
            const { processedText, toolCalls } = await processToolCalls(chunk);

            // If tool calls were found and processed, use the processed text
            if (toolCalls.length > 0) {
              controller.enqueue(processedText);
              return;
            }
          }

          // No tool calls or processing failed, pass through the original chunk
          controller.enqueue(chunk);
        } catch (error) {
          logger.error('Error processing MCP tool calls in stream:', error);
          controller.enqueue(chunk); // Pass through the original chunk on error
        }
      },
    }),
  );

  return processedStream;
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
      return null;
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
