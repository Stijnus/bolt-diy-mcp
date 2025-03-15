import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { createDataStream, type Message as AIMessage } from 'ai';
import type { FileMap } from '~/lib/.server/llm/constants';
import { streamText, type StreamingOptions } from '~/lib/.server/llm/stream-text';
import type { IProviderSetting } from '~/types/model';
import { createScopedLogger } from '~/utils/logger';
import { getFilePaths, selectContext } from '~/lib/.server/llm/select-context';
import type { ProgressAnnotation } from '~/types/context';
import { createSummary } from '~/lib/.server/llm/create-summary';
import { getMCPBootstrapPromise } from '~/lib/modules/mcp/bootstrap';

interface MessagePart {
  type: 'text' | 'image';
  text?: string;
  image?: string;
}

interface ExtendedMessage extends Omit<AIMessage, 'content'> {
  content: string | MessagePart[];
}

// Helper function to convert ExtendedMessage to AIMessage
function convertToAIMessage(message: ExtendedMessage): AIMessage {
  if (Array.isArray(message.content)) {
    // Convert MessagePart[] to string
    const textParts = message.content
      .filter((part) => part.type === 'text' && part.text)
      .map((part) => part.text as string);
    return {
      ...message,
      content: textParts.join('\n'),
    };
  }

  return message as AIMessage;
}

// Helper function to convert array of ExtendedMessages to AIMessages
function convertToAIMessages(messages: ExtendedMessage[]): AIMessage[] {
  return messages.map(convertToAIMessage);
}

interface ChatRequestBody {
  messages: ExtendedMessage[];
  files?: FileMap;
  apiKeys?: Record<string, string>;
  providerSettings?: Record<string, IProviderSetting>;
  promptId?: string;
  contextOptimization?: boolean;
  options?: StreamingOptions;
}

export async function action(args: ActionFunctionArgs) {
  return chatAction(args);
}

const logger = createScopedLogger('api.chat');

async function chatAction({ request, context }: ActionFunctionArgs) {
  try {
    // Debug MCP server status directly
    try {
      const { registry } = await getMCPBootstrapPromise();
      const servers = registry.getAllServers();
      const logger = createScopedLogger('ChatActionMCPDebug');

      logger.info(`Debug: Found ${servers.length} MCP servers`);

      for (const server of servers) {
        logger.info(`Debug MCP Server: ${server.name} (${server.id})`, {
          baseUrl: server.baseUrl,
          enabled: server.enabled,
        });

        // Test connection
        try {
          const status = await server.testConnection();
          logger.info(`Debug MCP Connection: ${status.success ? 'Connected' : 'Disconnected'}`, {
            message: status.message,
          });

          if (status.success) {
            // Get tools
            const tools = await server.getToolDefinitions();
            logger.info(`Debug MCP Tools: Found ${tools.length} tools`);
            tools.forEach((tool) => {
              logger.info(`Debug MCP Tool: ${tool.name}`, {
                description: tool.description,
              });
            });

            // Test GitHub API if this is GitHub
            if (server.id === 'github') {
              try {
                logger.info('Testing direct GitHub API call...');

                const result = await server.executeToolCall('github_get_user', {});
                logger.info('Direct GitHub API call succeeded!', {
                  username: result.login,
                  result: JSON.stringify(result),
                });
              } catch (error) {
                logger.error('Direct GitHub API call failed', error);
              }
            }
          }
        } catch (error) {
          logger.error(`Error testing MCP server ${server.name}`, error);
        }
      }
    } catch (error) {
      const logger = createScopedLogger('ChatActionMCPDebug');
      logger.error('Error accessing MCP registry', error);
    }

    const body = (await request.json()) as ChatRequestBody;
    const {
      messages: rawMessages,
      files = {},
      apiKeys,
      providerSettings,
      promptId,
      contextOptimization = false,
      options,
    } = body;

    // Convert raw messages to ExtendedMessage type
    const messages = rawMessages;
    let progressCounter = 0;

    const dataStream = createDataStream({
      async execute(dataStream) {
        const filePaths = getFilePaths(files);
        let filteredFiles: FileMap | undefined;
        let summary: string | undefined;
        let messageSliceId = 0;

        if (messages.length > 3) {
          messageSliceId = messages.length - 3;
        }

        if (filePaths.length > 0 && contextOptimization) {
          logger.debug('Generating Chat Summary');
          dataStream.writeData({
            type: 'progress',
            label: 'summary',
            status: 'in-progress',
            order: progressCounter++,
            message: 'Analysing Request',
          } satisfies ProgressAnnotation);

          // Create a summary of the chat
          console.log(`Messages count: ${messages.length}`);

          summary = await createSummary({
            messages: convertToAIMessages(messages),
            env: context.cloudflare?.env,
            apiKeys,
            providerSettings,
            promptId,
            onFinish: (_resp) => {
              dataStream.writeData({
                type: 'progress',
                label: 'summary',
                status: 'complete',
                order: progressCounter++,
                message: 'Request Analysed',
              } satisfies ProgressAnnotation);
            },
          });

          // Select relevant files based on the chat context
          logger.debug('Selecting context files');
          dataStream.writeData({
            type: 'progress',
            label: 'context',
            status: 'in-progress',
            order: progressCounter++,
            message: 'Selecting Context',
          } satisfies ProgressAnnotation);

          filteredFiles = await selectContext({
            messages: convertToAIMessages(messages),
            files,
            env: context.cloudflare?.env,
            apiKeys,
            providerSettings,
            promptId,
            summary,
            onFinish: (_resp) => {
              dataStream.writeData({
                type: 'progress',
                label: 'context',
                status: 'complete',
                order: progressCounter++,
                message: 'Context Selected',
              } satisfies ProgressAnnotation);
            },
          });
        }

        // Stream the response
        const stream = await streamText({
          messages: messages.map((msg) => convertToAIMessage(msg)),
          env: context.cloudflare?.env,
          options,
          apiKeys,
          files,
          providerSettings,
          promptId,
          contextOptimization,
          contextFiles: filteredFiles || {},
          summary,
          messageSliceId,
        });

        // Merge the stream into the data stream
        stream.mergeIntoDataStream(dataStream);

        return;
      },
    });

    return new Response(dataStream as unknown as ReadableStream, {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  } catch (error) {
    logger.error('Error in chat action:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
