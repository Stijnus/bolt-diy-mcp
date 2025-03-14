/**
 * Module for converting MCP servers to AI SDK tools
 */

import { type Tool } from 'ai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { JSONSchemaToZod } from '@dmitryrechkin/json-schema-to-zod';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('MCPToolset');

export interface ToolSetConfig {
  mcpServers: Record<
    string,
    {
      baseUrl: string;
    }
  >;
  onCallTool?: (serverName: string, toolName: string, args: any, result: Promise<string>) => void;
}

export interface ToolSet {
  tools: Record<string, Tool>;
  clients: Record<string, Client>;
}

/**
 * Convert MCP servers to AI SDK toolset
 * @param config Toolset configuration
 * @returns Toolset and MCP clients
 */
export async function createToolSet(config: ToolSetConfig): Promise<ToolSet> {
  const toolset: ToolSet = {
    tools: {},
    clients: {},
  };

  for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
    try {
      logger.info(`Setting up MCP client for server: ${serverName} (${serverConfig.baseUrl})`);

      // Create SSE transport layer - direct initialization
      const url = new URL(serverConfig.baseUrl);
      const transport = new SSEClientTransport(url);

      // Create MCP client
      const client = new Client({
        name: `${serverName}-client`,
        version: '1.0.0',
      });

      // Store client in toolset
      toolset.clients[serverName] = client;

      try {
        // Connect client with timeout
        const connectPromise = client.connect(transport);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Connection timeout')), 10000); // 10 second timeout
        });

        await Promise.race([connectPromise, timeoutPromise]);
        logger.info(`Successfully connected to MCP server: ${serverName}`);

        // Get list of tools
        const toolList = await client.listTools();
        logger.info(`Discovered ${toolList.tools.length} tools from server: ${serverName}`);

        // Convert each tool to AI SDK tool
        for (const tool of toolList.tools) {
          let toolName = tool.name;

          if (toolName !== serverName) {
            toolName = `${serverName}_${toolName}`;
          }

          try {
            /*
             * Convert JSON Schema to Zod object
             * Type assert tool.inputSchema as any to resolve type errors
             */
            const zodSchema = JSONSchemaToZod.convert(tool.inputSchema as any);

            toolset.tools[toolName] = {
              description: tool.description || '',
              parameters: zodSchema, // Use converted Zod schema
              execute: async (args) => {
                const resultPromise = (async () => {
                  try {
                    const result = await client.callTool({
                      name: tool.name,
                      arguments: args,
                    });

                    return JSON.stringify(result);
                  } catch (error) {
                    logger.error(`Error calling tool ${toolName}:`, error);
                    throw new Error(
                      `Failed to execute tool ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
                    );
                  }
                })();

                if (config.onCallTool) {
                  config.onCallTool(serverName, toolName, args, resultPromise);
                }

                return resultPromise;
              },
            };

            logger.debug(`Registered tool: ${toolName}`);
          } catch (error) {
            logger.error(`Failed to register tool ${toolName}:`, error);
          }
        }
      } catch (error) {
        logger.error(`Failed to connect to MCP server ${serverName}:`, error);
      }
    } catch (error) {
      logger.error(`Failed to setup MCP client for server ${serverName}:`, error);
    }
  }

  return toolset;
}
