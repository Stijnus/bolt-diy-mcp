/**
 * Hook for managing MCP servers through the API
 */

import { useState, useEffect, useCallback } from 'react';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('useMCPServers');

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
      const response = await fetch(`/api/mcp-servers?action=list&includeDisabled=${includeDisabled}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch servers: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Convert lastChecked strings to Date objects
      const formattedServers = data.servers.map((server: any) => ({
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
  const addServer = useCallback(async (params: AddServerParams) => {
    try {
      const response = await fetch('/api/mcp-servers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Failed to add server: ${response.statusText}`);
      }
      
      // Refresh the server list
      await fetchServers(true);
      
      return await response.json();
    } catch (error) {
      logger.error('Error adding MCP server:', error);
      throw error;
    }
  }, [fetchServers]);

  /**
   * Update a server
   * @param params Update parameters
   */
  const updateServer = useCallback(async (params: UpdateServerParams) => {
    try {
      const response = await fetch('/api/mcp-servers', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Failed to update server: ${response.statusText}`);
      }
      
      // Refresh the server list
      await fetchServers(true);
      
      return await response.json();
    } catch (error) {
      logger.error('Error updating MCP server:', error);
      throw error;
    }
  }, [fetchServers]);

  /**
   * Enable or disable a server
   * @param serverId Server ID
   * @param enabled Whether to enable the server
   */
  const setServerEnabled = useCallback(async (serverId: string, enabled: boolean) => {
    try {
      const response = await fetch('/api/mcp-servers', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          serverId,
          enabled,
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Failed to ${enabled ? 'enable' : 'disable'} server: ${response.statusText}`);
      }
      
      // Refresh the server list
      await fetchServers(true);
      
      return await response.json();
    } catch (error) {
      logger.error(`Error ${enabled ? 'enabling' : 'disabling'} MCP server:`, error);
      throw error;
    }
  }, [fetchServers]);

  /**
   * Remove a server
   * @param serverId Server ID
   */
  const removeServer = useCallback(async (serverId: string) => {
    try {
      const response = await fetch(`/api/mcp-servers?serverId=${serverId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Failed to remove server: ${response.statusText}`);
      }
      
      // Refresh the server list
      await fetchServers(true);
      
      return await response.json();
    } catch (error) {
      logger.error('Error removing MCP server:', error);
      throw error;
    }
  }, [fetchServers]);

  /**
   * Refresh the status of all servers
   */
  const refreshAllServers = useCallback(async () => {
    try {
      const response = await fetch('/api/mcp-servers?action=refresh');
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Failed to refresh servers: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Convert lastChecked strings to Date objects
      const formattedServers = data.servers.map((server: any) => ({
        ...server,
        lastChecked: new Date(server.lastChecked),
      }));
      
      setServers(formattedServers);
      
      return formattedServers;
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
      const response = await fetch(`/api/mcp-servers?action=refresh&serverId=${serverId}`);
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Failed to refresh server: ${response.statusText}`);
      }
      
      const data = await response.json();
      const updatedServer = {
        ...data.server,
        lastChecked: new Date(data.server.lastChecked),
      };
      
      // Update the server in the list
      setServers(prev => prev.map(server => 
        server.id === serverId ? updatedServer : server
      ));
      
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
      const response = await fetch(`/api/mcp-servers?action=discover&port=${port}`);
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Failed to discover servers: ${response.statusText}`);
      }
      
      const data = await response.json();
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
  const autoDiscoverAndAddServers = useCallback(async () => {
    setDiscoveringServers(true);
    
    try {
      const response = await fetch('/api/mcp-servers?action=auto-discover');
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Failed to auto-discover servers: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Convert lastChecked strings to Date objects
      const formattedServers = data.servers.map((server: any) => ({
        ...server,
        lastChecked: new Date(server.lastChecked),
      }));
      
      setServers(formattedServers);
      
      return {
        addedCount: data.addedCount,
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