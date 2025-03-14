/**
 * MCP Bootstrap Module
 * Initializes MCP during application startup
 */

import { createScopedLogger } from '~/utils/logger';
import { getEnvironmentVariables } from './env';
import { MCPServerRegistry } from './registry';
import { MCPToolFactory } from './tool-factory';

const logger = createScopedLogger('MCPBootstrap');

/**
 * Initialize MCP using the new modular architecture
 * This function should be called as early as possible in the application lifecycle
 */
export async function bootstrapMCP(): Promise<{
  registry: MCPServerRegistry;
  toolFactory: MCPToolFactory;
  runtimeManager: any; // Avoid circular import
}> {
  try {
    logger.info('Bootstrapping MCP with the modular architecture...');

    // Initialize registry from environment variables and localStorage
    const { initializeMCPWithRegistry } = await import('./index');
    const registry = await initializeMCPWithRegistry(getEnvironmentVariables());

    // Get the tool factory
    const toolFactory = MCPToolFactory.getInstance();

    // Initialize runtime manager
    const { MCPRuntimeManager } = await import('./runtime-manager');
    const runtimeManager = MCPRuntimeManager.getInstance();
    await runtimeManager.initialize({
      interval: 30000, // Check every 30 seconds
      onStatusChange: (status) => {
        logger.debug(`Server ${status.name} status changed: ${status.connected ? 'connected' : 'disconnected'}`);

        // Auto-discover tools when a server becomes connected
        if (status.connected) {
          // Refresh tools in the registry
          registry
            .getServer(status.id)
            ?.getToolDefinitions()
            .catch((error) => {
              logger.error(`Failed to get tools for server ${status.name}:`, error);
            });
        }
      },
    });

    // Try auto-discovering servers
    try {
      const addedCount = await runtimeManager.autoDiscoverAndAddServers();

      if (addedCount > 0) {
        logger.info(`Auto-discovered and added ${addedCount} MCP servers`);
      }
    } catch (error) {
      logger.error('Error auto-discovering MCP servers:', error);
    }

    // Log all registered servers
    const servers = registry.getAllServers();
    logger.info(`Registered ${servers.length} MCP servers`);

    for (const server of servers) {
      logger.info(`- ${server.name} (${server.id}): ${server.baseUrl} - ${server.enabled ? 'enabled' : 'disabled'}`);
    }

    logger.info('MCP bootstrap complete');

    return {
      registry,
      toolFactory,
      runtimeManager,
    };
  } catch (error) {
    logger.error('Failed to bootstrap MCP:', error);

    // Return empty instances as fallback
    const { MCPRuntimeManager } = await import('./runtime-manager');

    return {
      registry: MCPServerRegistry.getInstance(),
      toolFactory: MCPToolFactory.getInstance(),
      runtimeManager: MCPRuntimeManager.getInstance(),
    };
  }
}

/*
 * Auto-initialize MCP when this module is imported
 * This ensures MCP is initialized as early as possible
 */
let bootstrapPromise: Promise<{
  registry: MCPServerRegistry;
  toolFactory: MCPToolFactory;
  runtimeManager: any;
}> | null = null;

if (typeof window !== 'undefined') {
  // Only run in browser environment and ensure we only initialize once
  bootstrapPromise = bootstrapMCP().catch((error) => {
    logger.error('Unhandled error during MCP bootstrap:', error);

    // Return empty instances as fallback
    const { MCPRuntimeManager } = require('./runtime-manager');

    return {
      registry: MCPServerRegistry.getInstance(),
      toolFactory: MCPToolFactory.getInstance(),
      runtimeManager: MCPRuntimeManager.getInstance(),
    };
  });
}

/**
 * Get the current MCP bootstrap promise
 * This allows other parts of the application to wait for MCP initialization
 */
export function getMCPBootstrapPromise(): Promise<{
  registry: MCPServerRegistry;
  toolFactory: MCPToolFactory;
  runtimeManager: any;
}> {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapMCP();
  }

  return bootstrapPromise;
}
