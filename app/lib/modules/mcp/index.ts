/**
 * MCP Module Index
 * Central export point for MCP functionality
 */

// Export new modular architecture components
export type { IMCPServerAdapter, MCPConfig, MCPServerConfig, MCPTool, ConnectionStatus } from './config';
export { MCPServerRegistry, MCPRegistryEventType, type MCPRegistryEvent } from './registry';
export { MCPToolFactory, type ToolCreationOptions } from './tool-factory';
export { getMCPBootstrapPromise } from './bootstrap';
export { processToolCalls, type ToolCall } from './tool-handler';
export { MCPRuntimeManager, type ServerStatus, type HealthCheckOptions } from './runtime-manager';

// Export adapter classes and factory
export {
  BaseMCPServerAdapter,
  StandardMCPServerAdapter,
  GitHubMCPServerAdapter,
  createServerAdapter,
} from './adapters';

// Export legacy components (will be deprecated in future)
export { MCPManager } from './manager';
export type { ToolSet, ToolSetConfig } from './toolset';

// Export initialization functions
export { initializeMCP, getMCPClients, getMCPTools } from './init';

// Export storage functions
export { saveMCPServersToStorage, loadMCPServersFromStorage, getStoredMCPServers } from './storage';
export { getEnvironmentVariables } from './env';

// Re-export MCP SDK types for convenience
export type { Client } from '@modelcontextprotocol/sdk/client/index.js';

// Export examples for reference
export { mcpExample } from './example';
export { runRegistryExample, exampleUsage } from './examples/registry-example';
export { WeatherApiAdapter, createCustomAdapter, MinimalAdapter } from './examples/create-adapter';

/**
 * Initialize MCP during application startup
 * @param env Environment variables
 * @returns Promise that resolves when MCP is initialized
 */
export async function setupMCP(env: Record<string, string | undefined> = {}): Promise<void> {
  const { initializeMCP } = await import('./init');
  await initializeMCP(env);
}

/**
 * Initialize MCP using the new modular architecture
 * @param env Environment variables
 * @returns The initialized registry instance
 */
export async function initializeMCPWithRegistry(
  env: Record<string, string | undefined> = {},
): Promise<MCPServerRegistry> {
  const { getStoredMCPServers } = await import('./storage');
  const { createServerAdapter } = await import('./adapters');
  const { MCPServerRegistry } = await import('./registry');

  // Get registry instance
  const registry = MCPServerRegistry.getInstance();

  // Clear any existing servers
  registry.clear();

  // Load stored servers from localStorage
  const storedServers = getStoredMCPServers();

  // Register each server with the appropriate adapter
  for (const server of storedServers) {
    if (server.enabled) {
      const adapter = createServerAdapter(
        server.name.toLowerCase(), // ID
        server.name, // Display name
        server.baseUrl,
        server.enabled,
        { auth: server.auth },
      );

      registry.registerServer(adapter);
    }
  }

  // Initialize all servers
  await registry.initializeAll();

  return registry;
}

/**
 * Get tool descriptions for LLM prompts
 * This function generates a description of available MCP tools that can be included in LLM prompts
 * @returns String description of tools or empty string if no tools are available
 */
export async function getMCPToolsDescription(): Promise<string> {
  try {
    // Get the tool factory
    const { toolFactory } = await getMCPBootstrapPromise();

    // Generate tool description
    return await toolFactory.generateToolDescription();
  } catch (error) {
    const logger = await import('~/utils/logger').then((m) => m.createScopedLogger('getMCPToolsDescription'));
    logger.error('Failed to get MCP tool descriptions:', error);

    return '';
  }
}
