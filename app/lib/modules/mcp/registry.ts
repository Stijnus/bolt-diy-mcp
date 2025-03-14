/**
 * MCP Server Registry
 * Manages the collection of all MCP server adapters
 */

import { createScopedLogger } from '~/utils/logger';
import type { IMCPServerAdapter } from './config';

const logger = createScopedLogger('MCPRegistry');

/**
 * Event types for the MCP registry
 */
export enum MCPRegistryEventType {
  SERVER_ADDED = 'server-added',
  SERVER_REMOVED = 'server-removed',
  SERVER_UPDATED = 'server-updated',
  SERVER_STATUS_CHANGED = 'server-status-changed',
}

/**
 * Event data interface for MCP registry events
 */
export interface MCPRegistryEvent {
  type: MCPRegistryEventType;
  serverId: string;
  data?: any;
}

/**
 * Event listener type
 */
type EventListener = (event: MCPRegistryEvent) => void;

/**
 * MCP Server Registry
 * Manages registration and discovery of MCP server adapters
 */
export class MCPServerRegistry {
  private static _instance: MCPServerRegistry;
  private _adapters: Record<string, IMCPServerAdapter> = {};
  private _eventListeners: Record<MCPRegistryEventType, EventListener[]> = {
    [MCPRegistryEventType.SERVER_ADDED]: [],
    [MCPRegistryEventType.SERVER_REMOVED]: [],
    [MCPRegistryEventType.SERVER_UPDATED]: [],
    [MCPRegistryEventType.SERVER_STATUS_CHANGED]: [],
  };

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  /**
   * Get the singleton instance of the registry
   */
  static getInstance(): MCPServerRegistry {
    if (!MCPServerRegistry._instance) {
      MCPServerRegistry._instance = new MCPServerRegistry();
    }

    return MCPServerRegistry._instance;
  }

  /**
   * Register a new MCP server adapter
   * @param adapter The adapter to register
   */
  registerServer(adapter: IMCPServerAdapter): void {
    if (this._adapters[adapter.id]) {
      logger.warn(`Server with ID ${adapter.id} already registered. Updating instead.`);
      this._adapters[adapter.id] = adapter;
      this._emitEvent(MCPRegistryEventType.SERVER_UPDATED, adapter.id);
    } else {
      logger.info(`Registering MCP server: ${adapter.name} (${adapter.id})`);
      this._adapters[adapter.id] = adapter;
      this._emitEvent(MCPRegistryEventType.SERVER_ADDED, adapter.id);
    }
  }

  /**
   * Unregister a server adapter
   * @param serverId The ID of the server to unregister
   */
  unregisterServer(serverId: string): void {
    if (this._adapters[serverId]) {
      logger.info(`Unregistering MCP server: ${this._adapters[serverId].name} (${serverId})`);
      delete this._adapters[serverId];
      this._emitEvent(MCPRegistryEventType.SERVER_REMOVED, serverId);
    } else {
      logger.warn(`Attempted to unregister unknown server: ${serverId}`);
    }
  }

  /**
   * Get a server adapter by ID
   * @param serverId The ID of the server to get
   */
  getServer(serverId: string): IMCPServerAdapter | undefined {
    return this._adapters[serverId];
  }

  /**
   * Get all registered server adapters
   */
  getAllServers(): IMCPServerAdapter[] {
    return Object.values(this._adapters);
  }

  /**
   * Get all enabled server adapters
   */
  getEnabledServers(): IMCPServerAdapter[] {
    return Object.values(this._adapters).filter((adapter) => adapter.enabled);
  }

  /**
   * Update the status of a server
   * @param serverId The ID of the server to update
   * @param data Status data
   */
  updateServerStatus(serverId: string, data: any): void {
    this._emitEvent(MCPRegistryEventType.SERVER_STATUS_CHANGED, serverId, data);
  }

  /**
   * Subscribe to registry events
   * @param eventType The type of event to subscribe to
   * @param listener The listener function
   */
  subscribe(eventType: MCPRegistryEventType, listener: EventListener): void {
    this._eventListeners[eventType].push(listener);
  }

  /**
   * Unsubscribe from registry events
   * @param eventType The type of event to unsubscribe from
   * @param listener The listener function to remove
   */
  unsubscribe(eventType: MCPRegistryEventType, listener: EventListener): void {
    this._eventListeners[eventType] = this._eventListeners[eventType].filter((l) => l !== listener);
  }

  /**
   * Initialize all registered servers
   */
  async initializeAll(): Promise<void> {
    logger.info(`Initializing all MCP servers (${Object.keys(this._adapters).length})`);

    for (const adapter of Object.values(this._adapters)) {
      try {
        await adapter.initialize();
      } catch (error) {
        logger.error(`Failed to initialize MCP server: ${adapter.name}`, error);
      }
    }
  }

  /**
   * Clear all registered servers
   */
  clear(): void {
    this._adapters = {};
  }

  /**
   * Emit an event to all subscribed listeners
   * @param eventType The type of event to emit
   * @param serverId The ID of the server related to the event
   * @param data Additional event data
   */
  private _emitEvent(eventType: MCPRegistryEventType, serverId: string, data?: any): void {
    const event: MCPRegistryEvent = {
      type: eventType,
      serverId,
      data,
    };

    this._eventListeners[eventType].forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        logger.error(`Error in event listener for ${eventType}:`, error);
      }
    });
  }
}
