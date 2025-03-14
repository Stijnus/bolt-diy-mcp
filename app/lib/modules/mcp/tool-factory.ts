/**
 * MCP Tool Factory
 * Creates AI SDK tools from MCP server tools
 */

import { type Tool } from 'ai';
import { createScopedLogger } from '~/utils/logger';
import { MCPServerRegistry } from './registry';
import type { MCPTool } from './config';
import { JSONSchemaToZod } from '@dmitryrechkin/json-schema-to-zod';

const logger = createScopedLogger('MCPToolFactory');

/**
 * Options for creating tools
 */
export interface ToolCreationOptions {
  /**
   * Called when a tool is executed
   * @param serverId ID of the server
   * @param toolName Name of the tool
   * @param args Tool arguments
   * @param resultPromise Promise that resolves to the tool result
   */
  onToolCall?: (serverId: string, toolName: string, args: any, resultPromise: Promise<string>) => void;
}

/**
 * Factory to create AI SDK tools from MCP server adapters
 */
export class MCPToolFactory {
  private static _instance: MCPToolFactory;
  private _registry: MCPServerRegistry;

  private constructor() {
    this._registry = MCPServerRegistry.getInstance();
  }

  /**
   * Get the singleton instance of the factory
   */
  static getInstance(): MCPToolFactory {
    if (!MCPToolFactory._instance) {
      MCPToolFactory._instance = new MCPToolFactory();
    }

    return MCPToolFactory._instance;
  }

  /**
   * Create AI SDK tools from the MCP registry
   * @param options Tool creation options
   * @returns Object containing the tools
   */
  async createTools(options: ToolCreationOptions = {}): Promise<Record<string, Tool>> {
    const tools: Record<string, Tool> = {};
    const servers = this._registry.getEnabledServers();

    logger.info(`Creating tools from ${servers.length} enabled MCP servers`);

    for (const server of servers) {
      try {
        // Get tools from the server
        const serverTools = await server.getToolDefinitions();

        logger.info(`Found ${serverTools.length} tools from server: ${server.name}`);

        // Create an AI SDK tool for each MCP tool
        for (const tool of serverTools) {
          const toolName = this._getToolName(server.id, tool.name);

          try {
            // Convert JSON Schema to Zod schema
            const zodSchema = JSONSchemaToZod.convert(tool.inputSchema || { type: 'object', properties: {} });

            // Create the AI SDK tool
            tools[toolName] = {
              description: tool.description || `Tool from ${server.name} MCP server`,
              parameters: zodSchema,
              execute: async (args) => {
                const resultPromise = (async () => {
                  try {
                    const result = await server.executeToolCall(tool.name, args);
                    return JSON.stringify(result);
                  } catch (error) {
                    logger.error(`Error executing tool ${toolName}:`, error);
                    throw new Error(
                      `Failed to execute tool ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
                    );
                  }
                })();

                // Call the tool execution callback if provided
                if (options.onToolCall) {
                  options.onToolCall(server.id, toolName, args, resultPromise);
                }

                return resultPromise;
              },
            };

            logger.debug(`Registered tool: ${toolName}`);
          } catch (error) {
            logger.error(`Failed to create tool ${toolName}:`, error);
          }
        }
      } catch (error) {
        logger.error(`Failed to get tools from server ${server.name}:`, error);
      }
    }

    return tools;
  }

  /**
   * Get the list of available tools from the MCP registry
   * @returns Map of server ID to tool list
   */
  async getAvailableTools(): Promise<Record<string, MCPTool[]>> {
    const serverTools: Record<string, MCPTool[]> = {};
    const servers = this._registry.getEnabledServers();

    for (const server of servers) {
      try {
        serverTools[server.id] = await server.getToolDefinitions();
      } catch (error) {
        logger.error(`Failed to get tools from server ${server.name}:`, error);
        serverTools[server.id] = [];
      }
    }

    return serverTools;
  }

  /**
   * Generate a description of available MCP tools for LLM prompts
   * @returns String description of tools
   */
  async generateToolDescription(): Promise<string> {
    const servers = this._registry.getEnabledServers();

    if (servers.length === 0) {
      return '';
    }

    let description = 'IMPORTANT: You have access to external tools through the Model Context Protocol (MCP).\n\n';
    description += 'Available tools:\n\n';

    for (const server of servers) {
      try {
        const tools = await server.getToolDefinitions();

        if (tools.length === 0) {
          continue;
        }

        description += `### ${server.name} MCP Server\n\n`;

        for (const tool of tools) {
          const toolName = this._getToolName(server.id, tool.name);
          description += `- ${toolName}: ${tool.description}\n`;

          // Add schema information if available
          if (tool.inputSchema && Object.keys(tool.inputSchema.properties || {}).length > 0) {
            description += '  Parameters:\n';

            for (const [paramName, param] of Object.entries(tool.inputSchema.properties || {})) {
              // @ts-ignore
              const required = tool.inputSchema.required?.includes(paramName) ? ' (required)' : '';

              // @ts-ignore
              description += `  - ${paramName}${required}: ${param.description || param.type}\n`;
            }
          }

          description += '\n';
        }
      } catch (error) {
        logger.error(`Failed to get tools from server ${server.name}:`, error);
      }
    }

    // Add usage information
    description += `
To use a tool, follow this syntax:

<tool name="tool_name" input="tool input">
  Call the tool with the specified input
</tool>

For example:

<tool name="github_search_repositories" input="{ \\"query\\": \\"react state management\\" }">
  Search for repositories about React state management
</tool>

Tools will be executed and their results returned to you.
`;

    return description;
  }

  /**
   * Generate the full tool name
   * @param serverId Server ID
   * @param toolName Tool name
   * @returns Full tool name
   */
  private _getToolName(serverId: string, toolName: string): string {
    // For GitHub tools, use the tool name directly if it already has the github_ prefix
    if (serverId === 'github' && toolName.startsWith('github_')) {
      return toolName;
    }

    // For all other tools, combine the server ID and tool name
    return `${serverId}_${toolName}`;
  }
}
