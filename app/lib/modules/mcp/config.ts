/**
 * Type definitions related to MCP(Model Context Protocol) configuration
 */

/**
 * MCP server configuration interface
 */
export interface MCPServerConfig {
  baseUrl: string;
  auth?: {
    type?: 'github' | 'anthropic' | string;
    token?: string;
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

export interface MCPServer {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  connected: boolean;
  lastChecked: Date;
  toolCount: number;
  statusMessage: string;
  config: MCPServerConfig;
}

export const DEFAULT_MCP_SERVERS: MCPServer[] = [
  {
    id: 'github',
    name: 'GitHub',
    baseUrl: 'https://api.github.com',
    enabled: true,
    connected: false,
    lastChecked: new Date(),
    toolCount: 0,
    statusMessage: 'Not connected',
    config: {
      baseUrl: 'https://api.github.com',
      auth: {
        type: 'github',
        token: '', // User will need to provide their GitHub token
      },
    },
  },
];
