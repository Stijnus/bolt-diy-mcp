/**
 * Base MCP Server Adapter
 * Provides a common implementation for all MCP server adapters
 */

import { createScopedLogger } from '~/utils/logger';
import { ConnectionStatus, IMCPServerAdapter, MCPServerConfig, MCPTool } from '~/lib/modules/mcp/config';

const logger = createScopedLogger('MCPBaseAdapter');

/**
 * Base class for MCP server adapters
 * Implements common functionality shared across all adapter types
 */
export abstract class BaseMCPServerAdapter implements IMCPServerAdapter {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  protected _config: MCPServerConfig;

  /**
   * Create a new adapter instance
   * @param id Unique identifier for this server
   * @param name Display name for this server
   * @param baseUrl Base URL for the server API
   * @param enabled Whether this server is enabled
   * @param config Additional configuration
   */
  constructor(
    id: string,
    name: string,
    baseUrl: string,
    enabled: boolean = true,
    config: Partial<MCPServerConfig> = {},
  ) {
    this.id = id;
    this.name = name;
    this.baseUrl = baseUrl;
    this.enabled = enabled;
    this._config = {
      baseUrl,
      ...config,
    };
  }

  /**
   * Get the configuration for this server
   */
  getConfig(): MCPServerConfig {
    return { ...this._config };
  }

  /**
   * Update the configuration for this server
   * @param config New configuration
   */
  updateConfig(config: Partial<MCPServerConfig>): void {
    this._config = {
      ...this._config,
      ...config,
    };

    // Update baseUrl from config if provided
    if (config.baseUrl) {
      this.baseUrl = config.baseUrl;
    }
  }

  /**
   * Initialize the server adapter
   * Override in subclasses with specific initialization logic
   */
  async initialize(): Promise<void> {
    logger.info(`Initializing MCP server adapter: ${this.name}`);

    try {
      // Perform connection test to validate configuration
      const status = await this.testConnection();

      if (status.success) {
        logger.info(`Successfully connected to MCP server: ${this.name}`);
      } else {
        logger.warn(`Could not connect to MCP server: ${this.name} - ${status.message}`);
      }
    } catch (error) {
      logger.error(`Failed to initialize MCP server adapter: ${this.name}`, error);
    }
  }

  /**
   * Get the list of tools provided by this server
   * Override in subclasses with specific tool discovery logic
   */
  abstract getToolDefinitions(): Promise<MCPTool[]>;

  /**
   * Test the connection to this server
   * Override in subclasses with specific connection testing logic
   */
  abstract testConnection(): Promise<ConnectionStatus>;

  /**
   * Execute a tool call
   * Override in subclasses with specific tool execution logic
   * @param toolName Name of the tool to execute
   * @param args Arguments for the tool
   */
  abstract executeToolCall(toolName: string, args: any): Promise<any>;
}
