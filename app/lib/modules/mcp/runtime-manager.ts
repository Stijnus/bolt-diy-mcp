/**
 * MCP Runtime Manager
 * Handles runtime management of MCP servers, including discovery, health checking,
 * and dynamic addition/removal of servers
 */

import { createScopedLogger } from '~/utils/logger';
import { MCPServerRegistry, MCPRegistryEventType, MCPRegistryEvent } from './registry';
import { MCPToolFactory } from './tool-factory';
import { ConnectionStatus, IMCPServerAdapter } from './config';
import { createServerAdapter } from './adapters';
import { saveMCPServersToStorage, getStoredMCPServers } from './storage';

const logger = createScopedLogger('MCPRuntimeManager');

// Default health check interval in milliseconds (30 seconds)
const DEFAULT_HEALTH_CHECK_INTERVAL = 30000;

/**
 * Information about an MCP server's status
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
 * Health check options
 */
export interface HealthCheckOptions {
  interval?: number;
  onStatusChange?: (status: ServerStatus) => void;
}

/**
 * Manages runtime aspects of MCP servers
 */
export class MCPRuntimeManager {
  private static _instance: MCPRuntimeManager;
  private _registry: MCPServerRegistry;
  private _toolFactory: MCPToolFactory;
  private _serverStatus: Record<string, ServerStatus> = {};
  private _healthCheckIntervals: Record<string, number> = {};
  private _globalHealthCheckInterval: number | null = null;
  private _statusChangeCallbacks: Array<(status: ServerStatus) => void> = [];

  /**
   * Create a new runtime manager
   * @private Use getInstance() instead
   */
  private constructor() {
    this._registry = MCPServerRegistry.getInstance();
    this._toolFactory = MCPToolFactory.getInstance();

    // Subscribe to registry events
    this._registry.subscribe(MCPRegistryEventType.SERVER_ADDED, this._handleServerAdded.bind(this));
    this._registry.subscribe(MCPRegistryEventType.SERVER_REMOVED, this._handleServerRemoved.bind(this));
    this._registry.subscribe(MCPRegistryEventType.SERVER_UPDATED, this._handleServerUpdated.bind(this));
  }

  /**
   * Get the singleton instance of the runtime manager
   */
  static getInstance(): MCPRuntimeManager {
    if (!MCPRuntimeManager._instance) {
      MCPRuntimeManager._instance = new MCPRuntimeManager();
    }

    return MCPRuntimeManager._instance;
  }

  /**
   * Initialize the runtime manager
   * @param options Health check options
   */
  async initialize(options: HealthCheckOptions = {}): Promise<void> {
    logger.info('Initializing MCP Runtime Manager');

    // Initialize server status objects
    await this._initializeServerStatus();

    // Start health checks
    this.startHealthChecks(options);
  }

  /**
   * Initialize status objects for all registered servers
   */
  private async _initializeServerStatus(): Promise<void> {
    const servers = this._registry.getAllServers();

    for (const server of servers) {
      await this._createServerStatus(server);
    }
  }

  /**
   * Create a status object for a server
   * @param server Server adapter
   */
  private async _createServerStatus(server: IMCPServerAdapter): Promise<void> {
    this._serverStatus[server.id] = {
      id: server.id,
      name: server.name,
      baseUrl: server.baseUrl,
      enabled: server.enabled,
      connected: false,
      toolCount: 0,
      lastChecked: new Date(),
    };

    // Check connection immediately
    await this._checkServerHealth(server.id);
  }

  /**
   * Handle server added event
   * @param event Event data
   */
  private async _handleServerAdded(event: MCPRegistryEvent): Promise<void> {
    const server = this._registry.getServer(event.serverId);

    if (server) {
      logger.info(`Server added: ${server.name} (${server.id})`);
      await this._createServerStatus(server);
      this._startServerHealthCheck(server.id);
    }
  }

  /**
   * Handle server removed event
   * @param event Event data
   */
  private _handleServerRemoved(event: MCPRegistryEvent): void {
    logger.info(`Server removed: ${event.serverId}`);
    this._stopServerHealthCheck(event.serverId);
    delete this._serverStatus[event.serverId];
  }

  /**
   * Handle server updated event
   * @param event Event data
   */
  private async _handleServerUpdated(event: MCPRegistryEvent): Promise<void> {
    const server = this._registry.getServer(event.serverId);

    if (server) {
      logger.info(`Server updated: ${server.name} (${server.id})`);

      // Update basic status info
      if (this._serverStatus[server.id]) {
        this._serverStatus[server.id].name = server.name;
        this._serverStatus[server.id].baseUrl = server.baseUrl;
        this._serverStatus[server.id].enabled = server.enabled;
      } else {
        // Create status if it doesn't exist
        await this._createServerStatus(server);
      }

      // Check health to update connection status
      await this._checkServerHealth(server.id);
    }
  }

  /**
   * Start health checks for all servers
   * @param options Health check options
   */
  startHealthChecks(options: HealthCheckOptions = {}): void {
    const interval = options.interval || DEFAULT_HEALTH_CHECK_INTERVAL;

    // Register status change callback if provided
    if (options.onStatusChange) {
      this._statusChangeCallbacks.push(options.onStatusChange);
    }

    // Stop existing health check if running
    this.stopHealthChecks();

    // Start global health check interval
    this._globalHealthCheckInterval = window.setInterval(async () => {
      await this._checkAllServersHealth();
    }, interval);

    logger.info(`Started global health check with interval ${interval}ms`);
  }

  /**
   * Stop all health checks
   */
  stopHealthChecks(): void {
    // Clear global interval
    if (this._globalHealthCheckInterval !== null) {
      clearInterval(this._globalHealthCheckInterval);
      this._globalHealthCheckInterval = null;
    }

    // Clear individual server intervals
    for (const serverId in this._healthCheckIntervals) {
      this._stopServerHealthCheck(serverId);
    }

    logger.info('Stopped all health checks');
  }

  /**
   * Start health check for a specific server
   * @param serverId Server ID
   * @param interval Check interval in milliseconds
   */
  private _startServerHealthCheck(serverId: string, interval: number = DEFAULT_HEALTH_CHECK_INTERVAL): void {
    // Stop existing check if running
    this._stopServerHealthCheck(serverId);

    // Start new interval
    this._healthCheckIntervals[serverId] = window.setInterval(async () => {
      await this._checkServerHealth(serverId);
    }, interval);

    logger.debug(`Started health check for server ${serverId} with interval ${interval}ms`);
  }

  /**
   * Stop health check for a specific server
   * @param serverId Server ID
   */
  private _stopServerHealthCheck(serverId: string): void {
    if (this._healthCheckIntervals[serverId]) {
      clearInterval(this._healthCheckIntervals[serverId]);
      delete this._healthCheckIntervals[serverId];
      logger.debug(`Stopped health check for server ${serverId}`);
    }
  }

  /**
   * Check health of all servers
   */
  private async _checkAllServersHealth(): Promise<void> {
    const servers = this._registry.getAllServers();

    for (const server of servers) {
      if (server.enabled) {
        await this._checkServerHealth(server.id);
      }
    }
  }

  /**
   * Check health of a specific server
   * @param serverId Server ID
   */
  private async _checkServerHealth(serverId: string): Promise<void> {
    const server = this._registry.getServer(serverId);

    if (!server) {
      logger.warn(`Cannot check health of unknown server: ${serverId}`);
      return;
    }

    if (!this._serverStatus[serverId]) {
      await this._createServerStatus(server);
    }

    const previousStatus = { ...this._serverStatus[serverId] };
    let statusChanged = false;

    try {
      // Update last checked timestamp
      this._serverStatus[serverId].lastChecked = new Date();

      // Skip check if server is disabled
      if (!server.enabled) {
        this._serverStatus[serverId].connected = false;
        this._serverStatus[serverId].statusMessage = 'Server is disabled';

        return;
      }

      // Check connection
      const connectionStatus: ConnectionStatus = await server.testConnection();

      // Update status
      const wasConnected = this._serverStatus[serverId].connected;
      this._serverStatus[serverId].connected = connectionStatus.success;
      this._serverStatus[serverId].statusMessage = connectionStatus.message;

      // Check if connection status changed
      if (wasConnected !== connectionStatus.success) {
        statusChanged = true;

        if (connectionStatus.success) {
          logger.info(`Server ${server.name} (${serverId}) is now connected`);

          // If newly connected, get tools
          const tools = await server.getToolDefinitions();
          this._serverStatus[serverId].toolCount = tools.length;
        } else {
          logger.warn(`Server ${server.name} (${serverId}) is now disconnected: ${connectionStatus.message}`);
          this._serverStatus[serverId].toolCount = 0;
        }
      }
    } catch (error) {
      // Update status on error
      this._serverStatus[serverId].connected = false;
      this._serverStatus[serverId].errorMessage = error instanceof Error ? error.message : String(error);
      this._serverStatus[serverId].statusMessage = 'Error checking server health';

      statusChanged = this._serverStatus[serverId].connected !== false;
      logger.error(`Error checking health of server ${serverId}:`, error);
    }

    // Notify status change if needed
    if (statusChanged || JSON.stringify(previousStatus) !== JSON.stringify(this._serverStatus[serverId])) {
      this._notifyStatusChange(this._serverStatus[serverId]);
    }
  }

  /**
   * Notify all status change callbacks
   * @param status Updated server status
   */
  private _notifyStatusChange(status: ServerStatus): void {
    for (const callback of this._statusChangeCallbacks) {
      try {
        callback(status);
      } catch (error) {
        logger.error('Error in status change callback:', error);
      }
    }
  }

  /**
   * Subscribe to server status changes
   * @param callback Function to call when a server's status changes
   * @returns Function to unsubscribe
   */
  onStatusChange(callback: (status: ServerStatus) => void): () => void {
    this._statusChangeCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      this._statusChangeCallbacks = this._statusChangeCallbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * Get status of all servers
   * @param includeDisabled Whether to include disabled servers
   * @returns Array of server status objects
   */
  getAllServerStatus(includeDisabled: boolean = false): ServerStatus[] {
    const statuses = Object.values(this._serverStatus);

    if (includeDisabled) {
      return statuses;
    }

    return statuses.filter((status) => status.enabled);
  }

  /**
   * Get status of a specific server
   * @param serverId Server ID
   * @returns Server status or undefined if not found
   */
  getServerStatus(serverId: string): ServerStatus | undefined {
    return this._serverStatus[serverId];
  }

  /**
   * Force a health check for a specific server
   * @param serverId Server ID
   */
  async refreshServerStatus(serverId: string): Promise<void> {
    await this._checkServerHealth(serverId);
  }

  /**
   * Force a health check for all servers
   */
  async refreshAllServerStatus(): Promise<void> {
    await this._checkAllServersHealth();
  }

  /**
   * Add a new server at runtime
   * @param name Server name
   * @param baseUrl Server URL
   * @param config Additional configuration
   * @returns The added server's ID
   */
  async addServer(name: string, baseUrl: string, config: any = {}): Promise<string> {
    // Generate a unique ID (lowercase name)
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_');

    // Check if a server with this ID already exists
    if (this._registry.getServer(id)) {
      throw new Error(`Server with ID ${id} already exists`);
    }

    // Create the adapter
    const adapter = createServerAdapter(id, name, baseUrl, true, config);

    // Register the adapter
    this._registry.registerServer(adapter);

    // Initialize the adapter
    await adapter.initialize();

    // Save to storage
    this._saveToStorage();

    // Return the ID
    return id;
  }

  /**
   * Remove a server at runtime
   * @param serverId Server ID
   */
  removeServer(serverId: string): void {
    const server = this._registry.getServer(serverId);

    if (!server) {
      logger.warn(`Cannot remove unknown server: ${serverId}`);
      return;
    }

    // Unregister the adapter
    this._registry.unregisterServer(serverId);

    // Save to storage
    this._saveToStorage();
  }

  /**
   * Enable or disable a server
   * @param serverId Server ID
   * @param enabled Whether the server should be enabled
   */
  async setServerEnabled(serverId: string, enabled: boolean): Promise<void> {
    const server = this._registry.getServer(serverId);

    if (!server) {
      logger.warn(`Cannot update unknown server: ${serverId}`);
      return;
    }

    // Update enabled state
    server.enabled = enabled;

    // Update status
    if (this._serverStatus[serverId]) {
      this._serverStatus[serverId].enabled = enabled;
    }

    // Trigger server updated event
    this._registry.updateServerStatus(serverId, { enabled });

    // Save to storage
    this._saveToStorage();

    // Check health if enabled
    if (enabled) {
      await this._checkServerHealth(serverId);
    }
  }

  /**
   * Update a server's configuration
   * @param serverId Server ID
   * @param updates Configuration updates
   */
  async updateServer(serverId: string, updates: { name?: string; baseUrl?: string; config?: any }): Promise<void> {
    const server = this._registry.getServer(serverId);

    if (!server) {
      logger.warn(`Cannot update unknown server: ${serverId}`);
      return;
    }

    // Update fields
    if (updates.name) {
      server.name = updates.name;
    }

    if (updates.baseUrl) {
      server.baseUrl = updates.baseUrl;
      server.updateConfig({ baseUrl: updates.baseUrl });
    }

    if (updates.config) {
      server.updateConfig(updates.config);
    }

    // Update status
    if (this._serverStatus[serverId]) {
      if (updates.name) {
        this._serverStatus[serverId].name = updates.name;
      }

      if (updates.baseUrl) {
        this._serverStatus[serverId].baseUrl = updates.baseUrl;
      }
    }

    // Trigger server updated event
    this._registry.updateServerStatus(serverId, updates);

    // Save to storage
    this._saveToStorage();

    // Check health after update
    await this._checkServerHealth(serverId);
  }

  /**
   * Discover MCP servers on the local network
   * @param port Port to scan (default: 3001)
   * @returns Array of discovered servers
   */
  async discoverLocalServers(port: number = 3001): Promise<{ url: string; name: string; available: boolean }[]> {
    const discoveredServers: { url: string; name: string; available: boolean }[] = [];

    logger.info(`Discovering local MCP servers on port ${port}...`);

    try {
      // Try localhost
      const localhostUrl = `http://localhost:${port}/sse`;
      const localhostAvailable = await this._testServerUrl(localhostUrl);

      discoveredServers.push({
        url: localhostUrl,
        name: `Localhost:${port}`,
        available: localhostAvailable,
      });

      // Try 127.0.0.1
      const loopbackUrl = `http://127.0.0.1:${port}/sse`;

      if (localhostUrl !== loopbackUrl) {
        const loopbackAvailable = await this._testServerUrl(loopbackUrl);

        discoveredServers.push({
          url: loopbackUrl,
          name: `Loopback:${port}`,
          available: loopbackAvailable,
        });
      }

      logger.info(`Discovered ${discoveredServers.filter((s) => s.available).length} local MCP servers`);
    } catch (error) {
      logger.error('Error discovering local MCP servers:', error);
    }

    return discoveredServers;
  }

  /**
   * Test if a server URL is available
   * @param url Server URL
   * @returns True if the server is available
   */
  private async _testServerUrl(url: string): Promise<boolean> {
    try {
      // Create an abort controller with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);

      // Try to connect to the server
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Save current server configuration to storage
   */
  private _saveToStorage(): void {
    try {
      // Convert servers to storage format
      const servers = this._registry.getAllServers().map((server) => ({
        name: server.name,
        baseUrl: server.baseUrl,
        enabled: server.enabled,
        auth: server.getConfig().auth,
      }));

      // Save to storage
      saveMCPServersToStorage(servers);
      logger.debug('Saved server configuration to storage');
    } catch (error) {
      logger.error('Error saving server configuration to storage:', error);
    }
  }

  /**
   * Auto-discover and add MCP servers
   * @returns Number of discovered and added servers
   */
  async autoDiscoverAndAddServers(): Promise<number> {
    let addedCount = 0;

    try {
      // Discover local servers
      const discoveredServers = await this.discoverLocalServers();
      const availableServers = discoveredServers.filter((s) => s.available);

      // Add each discovered server if it doesn't already exist
      for (const server of availableServers) {
        try {
          // Check if this URL is already registered
          const existingServer = this._registry.getAllServers().find((s) => s.baseUrl === server.url);

          if (!existingServer) {
            await this.addServer(server.name, server.url);
            addedCount++;
          }
        } catch (error) {
          logger.error(`Error adding discovered server ${server.url}:`, error);
        }
      }

      logger.info(`Auto-discovered and added ${addedCount} MCP servers`);
    } catch (error) {
      logger.error('Error auto-discovering MCP servers:', error);
    }

    return addedCount;
  }
}
