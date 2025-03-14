/**
 * Type definitions related to MCP(Model Context Protocol) configuration
 */

/**
 * MCP server configuration interface
 */
export interface MCPServerConfig {
  baseUrl: string;
  auth?: {
    token?: string;
    type?: string;
  };
}

/**
 * MCP global configuration interface
 */
export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

/**
 * MCP Tool definition
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema?: any;
}

/**
 * Connection status result
 */
export interface ConnectionStatus {
  success: boolean;
  message: string;
}

/**
 * Base interface for MCP Server Adapters
 * All MCP server types should implement this interface
 */
export interface IMCPServerAdapter {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;

  /**
   * Get the list of tools provided by this server
   */
  getToolDefinitions(): Promise<MCPTool[]>;

  /**
   * Test the connection to this server
   */
  testConnection(): Promise<ConnectionStatus>;

  /**
   * Execute a tool call
   * @param toolName Name of the tool to execute
   * @param args Arguments for the tool
   */
  executeToolCall(toolName: string, args: any): Promise<any>;

  /**
   * Initialize the server adapter
   */
  initialize(): Promise<void>;

  /**
   * Get the configuration for this server
   */
  getConfig(): MCPServerConfig;

  /**
   * Update the configuration for this server
   * @param config New configuration
   */
  updateConfig(config: Partial<MCPServerConfig>): void;
}
