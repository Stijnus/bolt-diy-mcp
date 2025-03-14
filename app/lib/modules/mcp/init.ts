import { MCPManager } from './manager';
import { createScopedLogger } from '~/utils/logger';
import { loadMCPServersFromStorage } from './storage';

const logger = createScopedLogger('MCPInit');

/**
 * Initialize MCP functionality
 * This function should be called during application startup
 * @param env Environment variables
 * @returns Object containing MCP tools
 */
export async function initializeMCP(env: Record<string, string | undefined> = {}): Promise<Record<string, any>> {
  try {
    // Load MCP server configurations from localStorage
    const storageConfig = loadMCPServersFromStorage();

    /*
     * Merge environment variables with storage configurations
     * Environment variables take precedence over storage configurations
     */
    const mergedEnv = { ...storageConfig, ...env };

    // Get MCP Manager instance
    const mcpManager = MCPManager.getInstance(mergedEnv);

    // Check if any MCP servers are configured
    const serverNames = mcpManager.getAllServerNames();

    if (serverNames.length === 0) {
      logger.warn('No MCP servers configured. Add MCP_SSE_* environment variables to enable MCP functionality.');
      return {};
    }

    logger.info(`Initializing MCP with ${serverNames.length} servers: ${serverNames.join(', ')}`);

    // Initialize MCP tools
    const tools = await mcpManager.initializeTools();

    logger.info(`MCP initialization complete. ${Object.keys(tools).length} tools available.`);

    return tools;
  } catch (error) {
    logger.error('Failed to initialize MCP:', error);
    return {};
  }
}

/**
 * Get MCP clients
 * @param env Environment variables
 * @returns Object containing MCP clients
 */
export function getMCPClients(env: Record<string, string | undefined> = {}): Record<string, any> {
  // Load MCP server configurations from localStorage
  const storageConfig = loadMCPServersFromStorage();

  // Merge environment variables with storage configurations
  const mergedEnv = { ...storageConfig, ...env };

  const mcpManager = MCPManager.getInstance(mergedEnv);

  return mcpManager.clients;
}

/**
 * Get MCP tools
 * @param env Environment variables
 * @returns Object containing MCP tools
 */
export function getMCPTools(env: Record<string, string | undefined> = {}): Record<string, any> {
  // Load MCP server configurations from localStorage
  const storageConfig = loadMCPServersFromStorage();

  // Merge environment variables with storage configurations
  const mergedEnv = { ...storageConfig, ...env };

  const mcpManager = MCPManager.getInstance(mergedEnv);

  return mcpManager.tools;
}
