/**
 * Standard MCP Server Adapter
 * Implementation for standard SSE-based MCP servers
 */

import { createScopedLogger } from '~/utils/logger';
import { ConnectionStatus, MCPTool } from '../config';
import { BaseMCPServerAdapter } from './base-adapter';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const logger = createScopedLogger('MCPStandardAdapter');

/**
 * Standard MCP Server Adapter
 * Adapter for SSE-based Model Context Protocol servers
 */
export class StandardMCPServerAdapter extends BaseMCPServerAdapter {
  private _client: Client | null = null;
  private _transport: SSEClientTransport | null = null;
  private _tools: Record<string, any> = {};
  private _connected: boolean = false;

  /**
   * Initialize the server adapter
   * Connect to the MCP server and discover available tools
   */
  async initialize(): Promise<void> {
    logger.info(`Initializing standard MCP server adapter: ${this.name}`);
    
    try {
      await this._connect();
    } catch (error) {
      logger.error(`Failed to initialize standard MCP server: ${this.name}`, error);
      this._connected = false;
    }
  }

  /**
   * Connect to the MCP server
   */
  private async _connect(): Promise<void> {
    try {
      // Create URL from baseUrl
      const url = new URL(this.baseUrl);
      
      // Create transport
      this._transport = new SSEClientTransport(url);
      
      // Create client
      this._client = new Client({
        name: `${this.id}-client`,
        version: '1.0.0',
      });
      
      // Add auth token to headers if available
      if (this._config.auth?.token) {
        logger.info(`Adding authentication for ${this.name}`);
        // Note: The actual implementation might need to be adjusted based on authentication requirements
      }
      
      // Connect to the server with timeout
      const connectPromise = this._client.connect(this._transport);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), 10000); // 10 second timeout
      });
      
      await Promise.race([connectPromise, timeoutPromise]);
      
      // Get tools from the server
      await this._discoverTools();
      
      this._connected = true;
      logger.info(`Successfully connected to MCP server: ${this.name}`);
    } catch (error) {
      logger.error(`Failed to connect to MCP server: ${this.name}`, error);
      this._connected = false;
      throw error;
    }
  }

  /**
   * Discover available tools from the server
   */
  private async _discoverTools(): Promise<void> {
    if (!this._client) {
      throw new Error('MCP client not initialized');
    }
    
    try {
      // Get tool list from server
      const toolList = await this._client.listTools();
      
      if (!toolList || !toolList.tools) {
        logger.warn(`No tools found on MCP server: ${this.name}`);
        this._tools = {};
        return;
      }
      
      logger.info(`Discovered ${toolList.tools.length} tools from server: ${this.name}`);
      
      // Store tools
      this._tools = {};
      for (const tool of toolList.tools) {
        this._tools[tool.name] = tool;
      }
    } catch (error) {
      logger.error(`Failed to discover tools from MCP server: ${this.name}`, error);
      throw error;
    }
  }

  /**
   * Get the list of tools provided by this server
   */
  async getToolDefinitions(): Promise<MCPTool[]> {
    // Ensure we're connected and have tools
    if (!this._connected || !this._client) {
      try {
        await this._connect();
      } catch (error) {
        logger.error(`Failed to connect to MCP server: ${this.name}`, error);
        return [];
      }
    }
    
    // Convert tools to MCPTool format
    const tools: MCPTool[] = Object.values(this._tools).map(tool => ({
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema,
    }));
    
    return tools;
  }

  /**
   * Test the connection to this server
   */
  async testConnection(): Promise<ConnectionStatus> {
    try {
      // Create URL from baseUrl
      const url = new URL(this.baseUrl);
      
      // Create transport
      const transport = new SSEClientTransport(url);
      
      // Create client for testing
      const testClient = new Client({
        name: `${this.id}-test-client`,
        version: '1.0.0',
      });
      
      // Connect with timeout
      const connectPromise = testClient.connect(transport);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), 5000); // 5 second timeout
      });
      
      await Promise.race([connectPromise, timeoutPromise]);
      
      // Get tools to verify server is functional
      const toolList = await testClient.listTools();
      
      const toolCount = toolList?.tools?.length || 0;
      
      // Disconnect test client
      await testClient.disconnect();
      
      return {
        success: true,
        message: `Connection successful. ${toolCount} tools available.`,
      };
    } catch (error) {
      logger.error(`Failed to test connection to MCP server: ${this.name}`, error);
      return {
        success: false,
        message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Execute a tool call
   * @param toolName Name of the tool to execute
   * @param args Arguments for the tool
   */
  async executeToolCall(toolName: string, args: any): Promise<any> {
    // Ensure we're connected
    if (!this._connected || !this._client) {
      try {
        await this._connect();
      } catch (error) {
        throw new Error(`Cannot execute tool (${toolName}): Not connected to MCP server: ${this.name}`);
      }
    }
    
    // Check if the tool exists
    if (!this._tools[toolName]) {
      throw new Error(`Tool "${toolName}" not found on MCP server: ${this.name}`);
    }
    
    try {
      // Call the tool
      const result = await this._client.callTool({
        name: toolName,
        arguments: args,
      });
      
      return result;
    } catch (error) {
      logger.error(`Error calling tool ${toolName} on server ${this.name}:`, error);
      throw new Error(
        `Failed to execute tool ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}