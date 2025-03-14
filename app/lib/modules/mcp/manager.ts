import { type ToolSet } from './toolset';
import { createScopedLogger } from '~/utils/logger';
import type { MCPConfig, MCPServerConfig } from './config';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const logger = createScopedLogger('MCPManager');

/**
 * MCP Manager Class
 * Central management of MCP-related functionality (configuration, toolset)
 */
export class MCPManager {
  private static _instance: MCPManager;
  private _toolset: ToolSet | null = null;
  private _config: MCPConfig = { mcpServers: {} };

  private constructor(private readonly _env: Record<string, string | undefined> = {}) {
    this._loadConfigFromEnvironment();
  }

  /**
   * Returns MCPManager instance
   * @param env Environment variables object (optional)
   */
  static getInstance(env: Record<string, string | undefined> = {}): MCPManager {
    if (!MCPManager._instance) {
      MCPManager._instance = new MCPManager(env);
    }

    return MCPManager._instance;
  }

  /**
   * Load MCP server configuration from environment variables
   * Finds environment variables with MCP_SSE_ prefix and converts them to server settings
   * Example: MCP_SSE_TEST=http://localhost:3001/sse -> Sets baseUrl for 'test' server
   */
  private _loadConfigFromEnvironment(): void {
    const mcpServers: Record<string, MCPServerConfig> = {};
    const MCP_PREFIX = 'MCP_SSE_';
    const TOKEN_SUFFIX = '_TOKEN';

    // First pass: collect all base URLs
    for (const [key, value] of Object.entries(this._env)) {
      // Look for environment variables with MCP_SSE_ prefix but not ending with _TOKEN
      if (key.startsWith(MCP_PREFIX) && !key.endsWith(TOKEN_SUFFIX) && value) {
        // Extract server name (convert to lowercase for consistency)
        const serverName = key.slice(MCP_PREFIX.length).toLowerCase();

        if (serverName) {
          mcpServers[serverName] = {
            baseUrl: value,
          };
        }
      }
    }

    // Second pass: collect all tokens
    for (const [key, value] of Object.entries(this._env)) {
      // Look for environment variables with MCP_SSE_ prefix and ending with _TOKEN
      if (key.startsWith(MCP_PREFIX) && key.endsWith(TOKEN_SUFFIX) && value) {
        // Extract server name (convert to lowercase for consistency)
        const serverNameUpper = key.slice(MCP_PREFIX.length, key.length - TOKEN_SUFFIX.length);
        const serverName = serverNameUpper.toLowerCase();

        // If we have a server with this name, add the token
        if (serverName && mcpServers[serverName]) {
          mcpServers[serverName].auth = {
            token: value,
            type: serverName === 'github' ? 'github' : 'generic',
          };
        }
      }
    }

    this._config = { mcpServers };
  }

  /**
   * Returns current loaded MCP configuration
   */
  getConfig(): MCPConfig {
    return this._config;
  }

  /**
   * Returns configuration for a specific server
   * @param serverName Server name
   */
  getServerConfig(serverName: string): MCPServerConfig | undefined {
    return this._config.mcpServers[serverName];
  }

  /**
   * Returns list of all server names
   */
  getAllServerNames(): string[] {
    return Object.keys(this._config.mcpServers);
  }

  /**
   * Initialize MCP tools
   * @returns Map of tool name to tool definition
   */
  async initializeTools(): Promise<Record<string, any>> {
    const tools: Record<string, any> = {};

    for (const [serverName, config] of Object.entries(this._config.mcpServers)) {
      try {
        // Create URL from baseUrl
        const url = new URL(config.baseUrl);

        // Create transport
        const transport = new SSEClientTransport(url);

        // Create client
        const client = new Client({
          name: `${serverName}-client`,
          version: '1.0.0',
        });

        // If we have GitHub auth, add it to the request headers
        if (config.auth?.type === 'github' && config.auth.token) {
          logger.info(`Adding GitHub authentication for ${serverName}`);

          /*
           * GitHub authentication is configured. The token is stored in the server config
           * and will be used when making API calls to GitHub.
           *
           * Note: The actual API calls will need to include the token in their headers.
           */
        }

        // Connect to the server
        await client.connect(transport);

        // Get tools from the server
        const toolList = await client.listTools();

        // Add tools to the result
        if (toolList && toolList.tools) {
          logger.info(`Discovered ${toolList.tools.length} tools from server: ${serverName}`);

          for (const tool of toolList.tools) {
            tools[`${serverName}_${tool.name}`] = tool;
          }
        }
      } catch (error) {
        logger.error(`Failed to initialize tools for ${serverName}:`, error);
      }
    }

    return tools;
  }

  /**
   * Execute an MCP tool
   * @param toolName The name of the tool to execute
   * @param input The input to pass to the tool
   * @returns The result of the tool execution
   */
  async executeTool(toolName: string, input: any): Promise<any> {
    try {
      // Get the tool
      const tools = await this.initializeTools();

      if (!tools || !tools[toolName]) {
        throw new Error(`Tool "${toolName}" not found`);
      }

      // Get the server for this tool
      const serverName = Object.keys(this._config.mcpServers || {}).find(
        (serverName) => tools[toolName]._serverName === serverName,
      );

      if (!serverName) {
        throw new Error(`Server for tool "${toolName}" not found`);
      }

      // Execute the tool with retry logic
      const maxRetries = 3;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const response = await fetch(`${this._config.mcpServers?.[serverName]?.baseUrl}/execute`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              tool: toolName,
              input,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to execute tool: ${errorText}`);
          }

          return await response.json();
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          // Log the error
          logger.error(`Tool execution attempt ${attempt}/${maxRetries} failed:`, error);

          // If this is not the last attempt, wait before retrying
          if (attempt < maxRetries) {
            // Exponential backoff: 1s, 2s, 4s, etc.
            const backoffTime = Math.pow(2, attempt - 1) * 1000;
            logger.info(`Retrying in ${backoffTime}ms...`);
            await new Promise((resolve) => setTimeout(resolve, backoffTime));
          }
        }
      }

      // If we've exhausted all retries, throw the last error
      throw new Error(`Failed after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown error'}`);
    } catch (error) {
      logger.error(`Failed to execute tool "${toolName}":`, error);
      throw error;
    }
  }

  /**
   * Returns MCP toolset
   */
  get tools() {
    return this._toolset?.tools || {};
  }

  /**
   * Returns MCP clients
   */
  get clients() {
    return this._toolset?.clients || {};
  }
}
