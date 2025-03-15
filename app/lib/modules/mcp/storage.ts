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
 * Check if localStorage is available (not in SSR)
 * @returns Whether localStorage is available
 */
function isLocalStorageAvailable(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    // Test localStorage access
    const testKey = '__test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);

    return true;
  } catch {
    return false;
  }
}

/**
 * Load MCP server configurations from localStorage
 * @returns Environment variables with MCP server configurations
 */
export function loadMCPServersFromStorage(): Record<string, string> {
  try {
    // Check if localStorage is available (not in SSR)
    if (!isLocalStorageAvailable()) {
      logger.debug('localStorage not available (server context) - skipping load');
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
    // Check if localStorage is available (not in SSR)
    if (!isLocalStorageAvailable()) {
      logger.debug('localStorage not available (server context) - skipping save');
      return false;
    }

    // Debug information about the servers being saved
    logger.info(`Saving ${servers.length} MCP servers to localStorage`, {
      serverIds: servers.map((s) => s.name.toLowerCase().replace(/[^a-z0-9]/g, '_')),
      hasGitHub: servers.some(
        (s) => s.name.toLowerCase() === 'github' || s.auth?.type === 'github' || s.baseUrl.includes('github'),
      ),
      tokens: servers.map((s) => ({
        name: s.name,
        hasToken: !!s.auth?.token,
        tokenLength: s.auth?.token ? s.auth.token.length : 0,
        tokenPrefix: s.auth?.token ? s.auth.token.substring(0, 8) + '...' : undefined,
      })),
    });

    const envVars: Record<string, string> = {};

    servers.forEach((server) => {
      if (server.enabled) {
        envVars[`MCP_SSE_${server.name.toUpperCase()}`] = server.baseUrl;

        // Save auth configuration if present
        if (server.auth?.token) {
          envVars[`MCP_SSE_${server.name.toUpperCase()}_TOKEN`] = server.auth.token;
          logger.info(`Set token environment variable for ${server.name}`);
        }
      }
    });

    // Save to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
    logger.info(`Saved ${servers.length} MCP servers to localStorage`);

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
    if (!isLocalStorageAvailable()) {
      logger.debug('localStorage not available (server context) - returning empty array');
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
