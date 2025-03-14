/**
 * MCP Storage Module
 * Handles loading and saving MCP server configurations from localStorage
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('MCPStorage');
const STORAGE_KEY = 'mcp_servers';

interface StoredMCPServer {
  name: string;
  baseUrl: string;
  enabled: boolean;
  auth?: {
    token?: string;
    type?: string;
  };
}

/**
 * Load MCP server configurations from localStorage
 * @returns Environment variables with MCP server configurations
 */
export function loadMCPServersFromStorage(): Record<string, string> {
  try {
    // Check if localStorage is available (not in SSR)
    if (typeof localStorage === 'undefined') {
      return {};
    }

    // Get stored servers
    const storedServersJson = localStorage.getItem(STORAGE_KEY);

    if (!storedServersJson) {
      return {};
    }

    // Parse stored servers
    const storedServers = JSON.parse(storedServersJson) as StoredMCPServer[];

    if (!Array.isArray(storedServers)) {
      logger.warn('Invalid MCP server configuration in localStorage');
      return {};
    }

    // Convert to environment variables
    const envVars: Record<string, string> = {};

    storedServers.forEach((server) => {
      if (server.enabled && server.name && server.baseUrl) {
        envVars[`MCP_SSE_${server.name.toUpperCase()}`] = server.baseUrl;

        // Load auth token if present
        if (server.auth?.token) {
          envVars[`MCP_SSE_${server.name.toUpperCase()}_TOKEN`] = server.auth.token;
        }
      }
    });

    logger.info(`Loaded ${Object.keys(envVars).length} MCP server configurations from localStorage`);

    return envVars;
  } catch (error) {
    logger.error('Failed to load MCP server configurations from localStorage:', error);
    return {};
  }
}

/**
 * Save MCP server configurations to localStorage
 * @param servers MCP server configurations
 * @returns Success status
 */
export function saveMCPServersToStorage(servers: StoredMCPServer[]): boolean {
  try {
    const envVars: Record<string, string> = {};

    servers.forEach((server) => {
      if (server.enabled) {
        envVars[`MCP_SSE_${server.name.toUpperCase()}`] = server.baseUrl;

        // Save auth configuration if present
        if (server.auth?.token) {
          envVars[`MCP_SSE_${server.name.toUpperCase()}_TOKEN`] = server.auth.token;
        }
      }
    });

    localStorage.setItem('mcp_servers', JSON.stringify(servers));

    return true;
  } catch (error: unknown) {
    logger.error('Failed to save MCP server configurations to localStorage:', error);
    return false;
  }
}

/**
 * Get raw MCP server configurations from localStorage
 * @returns Array of stored MCP server configurations
 */
export function getStoredMCPServers(): StoredMCPServer[] {
  try {
    // Check if localStorage is available (not in SSR)
    if (typeof localStorage === 'undefined') {
      return [];
    }

    // Get stored servers
    const storedServersJson = localStorage.getItem(STORAGE_KEY);

    if (!storedServersJson) {
      return [];
    }

    // Parse stored servers
    const storedServers = JSON.parse(storedServersJson) as StoredMCPServer[];

    if (!Array.isArray(storedServers)) {
      logger.warn('Invalid MCP server configuration in localStorage');
      return [];
    }

    return storedServers;
  } catch (error) {
    logger.error('Failed to get MCP server configurations from localStorage:', error);
    return [];
  }
}
