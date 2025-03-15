/**
 * Hook for managing MCP servers through the API
 */

import { useState, useEffect, useCallback } from 'react';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('useMCPServers');

// API endpoint for MCP servers
const MCP_API_ENDPOINT = '/api/mcp-servers';

/**
 * Server status from the runtime manager
 */
export interface ServerStatus {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  connected: boolean;
  toolCount: number;
  lastChecked: Date;
  statusMessage?: string;
  errorMessage?: string;
}

/**
 * Discovered server information
 */
export interface DiscoveredServer {
  url: string;
  name: string;
  available: boolean;
}

/**
 * Parameters for adding a server
 */
export interface AddServerParams {
  name: string;
  baseUrl: string;
  config?: any;
}

/**
 * Parameters for updating a server
 */
export interface UpdateServerParams {
  serverId: string;
  name?: string;
  baseUrl?: string;
  config?: any;
}

interface AutoDiscoverResponse {
  addedCount: number;
  servers: ServerStatus[];
}

interface DiscoveryResponse {
  servers: DiscoveredServer[];
  error?: string;
}

interface ServerResponse {
  server: ServerStatus;
  error?: string;
}

interface ServersResponse {
  servers: ServerStatus[];
  error?: string;
  addedCount?: number;
}

// Type guard for ServerResponse
function isServerResponse(data: unknown): data is ServerResponse {
  return typeof data === 'object' && data !== null && 'server' in data;
}

// Type guard for ServersResponse
function isServersResponse(data: unknown): data is ServersResponse {
  return typeof data === 'object' && data !== null && 'servers' in data;
}

// Type guard for DiscoveryResponse
function isDiscoveryResponse(data: unknown): data is DiscoveryResponse {
  return typeof data === 'object' && data !== null && 'servers' in data;
}

/**
 * Hook for managing MCP servers
 */
export function useMCPServers() {
  const [servers, setServers] = useState<ServerStatus[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [discoveringServers, setDiscoveringServers] = useState<boolean>(false);
  const [discoveredServers, setDiscoveredServers] = useState<DiscoveredServer[]>([]);

  /**
   * Fetch the list of servers
   * @param includeDisabled Whether to include disabled servers
   */
  const fetchServers = useCallback(async (includeDisabled: boolean = false) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${MCP_API_ENDPOINT}?action=list&includeDisabled=${includeDisabled}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch servers: ${response.statusText}`);
      }

      const data = await response.json();

      if (!isServersResponse(data)) {
        throw new Error('Invalid server response format');
      }

      // Convert lastChecked strings to Date objects
      const formattedServers = data.servers.map((server) => ({
        ...server,
        lastChecked: new Date(server.lastChecked),
      }));

      setServers(formattedServers);
    } catch (error) {
      logger.error('Error fetching MCP servers:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch servers');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Add a new server
   * @param params Server parameters
   */
  const addServer = useCallback(
    async (params: AddServerParams) => {
      try {
        const response = await fetch(MCP_API_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(params),
        });

        const data = await response.json();

        if (!response.ok) {
          if (isServerResponse(data)) {
            throw new Error(data.error || `Failed to add server: ${response.statusText}`);
          }

          throw new Error(`Failed to add server: ${response.statusText}`);
        }

        await fetchServers(true);

        return data;
      } catch (error) {
        logger.error('Error adding MCP server:', error);
        throw error;
      }
    },
    [fetchServers],
  );

  /**
   * Update a server
   * @param params Update parameters
   */
  const updateServer = useCallback(
    async (params: UpdateServerParams) => {
      try {
        const response = await fetch(`${MCP_API_ENDPOINT}/${params.serverId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(params),
        });

        const data = await response.json();

        if (!response.ok) {
          if (isServerResponse(data)) {
            throw new Error(data.error || `Failed to update server: ${response.statusText}`);
          }

          throw new Error(`Failed to update server: ${response.statusText}`);
        }

        await fetchServers(true);

        return data;
      } catch (error) {
        logger.error('Error updating MCP server:', error);
        throw error;
      }
    },
    [fetchServers],
  );

  /**
   * Enable or disable a server
   * @param serverId Server ID
   * @param enabled Whether to enable the server
   */
  const setServerEnabled = useCallback(
    async (serverId: string, enabled: boolean) => {
      try {
        const response = await fetch(MCP_API_ENDPOINT, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            serverId,
            enabled,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          if (isServerResponse(data)) {
            throw new Error(data.error || `Failed to ${enabled ? 'enable' : 'disable'} server: ${response.statusText}`);
          }

          throw new Error(`Failed to ${enabled ? 'enable' : 'disable'} server: ${response.statusText}`);
        }

        await fetchServers(true);

        return data;
      } catch (error) {
        logger.error(`Error ${enabled ? 'enabling' : 'disabling'} MCP server:`, error);
        throw error;
      }
    },
    [fetchServers],
  );

  /**
   * Remove a server
   * @param serverId Server ID
   */
  const removeServer = useCallback(
    async (serverId: string) => {
      try {
        const response = await fetch(`${MCP_API_ENDPOINT}?serverId=${serverId}`, {
          method: 'DELETE',
        });

        const data = await response.json();

        if (!response.ok) {
          if (isServerResponse(data)) {
            throw new Error(data.error || `Failed to remove server: ${response.statusText}`);
          }

          throw new Error(`Failed to remove server: ${response.statusText}`);
        }

        await fetchServers(true);

        return data;
      } catch (error) {
        logger.error('Error removing MCP server:', error);
        throw error;
      }
    },
    [fetchServers],
  );

  /**
   * Refresh the status of all servers
   */
  const refreshAllServers = useCallback(async () => {
    try {
      const response = await fetch(`${MCP_API_ENDPOINT}?action=refresh`);

      const data = await response.json();

      if (!response.ok) {
        if (isServersResponse(data)) {
          throw new Error(data.error || `Failed to refresh servers: ${response.statusText}`);
        }

        throw new Error(`Failed to refresh servers: ${response.statusText}`);
      }

      if (!isServersResponse(data)) {
        throw new Error('Invalid server response format');
      }

      // Convert lastChecked strings to Date objects
      const formattedServers = data.servers.map((server) => ({
        ...server,
        lastChecked: new Date(server.lastChecked),
      }));

      setServers(formattedServers);
    } catch (error) {
      logger.error('Error refreshing MCP servers:', error);
      throw error;
    }
  }, []);

  /**
   * Refresh the status of a specific server
   * @param serverId Server ID
   */
  const refreshServer = useCallback(async (serverId: string) => {
    try {
      const response = await fetch(`${MCP_API_ENDPOINT}?action=refresh&serverId=${serverId}`);
      const data = await response.json();

      if (!response.ok) {
        if (isServerResponse(data)) {
          throw new Error(data.error || `Failed to refresh server: ${response.statusText}`);
        }

        throw new Error(`Failed to refresh server: ${response.statusText}`);
      }

      if (!isServerResponse(data)) {
        throw new Error('Invalid server response format');
      }

      const updatedServer = {
        ...data.server,
        lastChecked: new Date(data.server.lastChecked),
      };

      // Update the server in the list
      setServers((prev) => prev.map((server) => (server.id === serverId ? updatedServer : server)));

      return updatedServer;
    } catch (error) {
      logger.error('Error refreshing MCP server:', error);
      throw error;
    }
  }, []);

  /**
   * Discover local MCP servers
   * @param port Port to scan (default: 3001)
   */
  const discoverServers = useCallback(async (port: number = 3001) => {
    setDiscoveringServers(true);

    try {
      const response = await fetch(`${MCP_API_ENDPOINT}?action=discover&port=${port}`);
      const data = await response.json();

      if (!response.ok) {
        if (isDiscoveryResponse(data)) {
          throw new Error(data.error || `Failed to discover servers: ${response.statusText}`);
        }

        throw new Error(`Failed to discover servers: ${response.statusText}`);
      }

      if (!isDiscoveryResponse(data)) {
        throw new Error('Invalid discovery response format');
      }

      setDiscoveredServers(data.servers);

      return data.servers;
    } catch (error) {
      logger.error('Error discovering MCP servers:', error);
      throw error;
    } finally {
      setDiscoveringServers(false);
    }
  }, []);

  /**
   * Auto-discover and add servers
   */
  const autoDiscoverAndAddServers = useCallback(async (): Promise<AutoDiscoverResponse> => {
    setDiscoveringServers(true);

    try {
      const response = await fetch(`${MCP_API_ENDPOINT}?action=auto-discover`);
      const data = await response.json();

      if (!response.ok) {
        if (isServersResponse(data)) {
          throw new Error(data.error || `Failed to auto-discover servers: ${response.statusText}`);
        }

        throw new Error(`Failed to auto-discover servers: ${response.statusText}`);
      }

      if (!isServersResponse(data)) {
        throw new Error('Invalid server response format');
      }

      // Convert lastChecked strings to Date objects
      const formattedServers = data.servers.map((server) => ({
        ...server,
        lastChecked: new Date(server.lastChecked),
      }));

      setServers(formattedServers);

      return {
        addedCount: data.addedCount ?? 0,
        servers: formattedServers,
      };
    } catch (error) {
      logger.error('Error auto-discovering MCP servers:', error);
      throw error;
    } finally {
      setDiscoveringServers(false);
    }
  }, []);

  // Load servers on mount
  useEffect(() => {
    fetchServers(true);
  }, [fetchServers]);

  return {
    servers,
    loading,
    error,
    discoveringServers,
    discoveredServers,
    fetchServers,
    addServer,
    updateServer,
    setServerEnabled,
    removeServer,
    refreshAllServers,
    refreshServer,
    discoverServers,
    autoDiscoverAndAddServers,
  };
}
