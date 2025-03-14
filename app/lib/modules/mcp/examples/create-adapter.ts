/**
 * MCP Server Adapter Creation Tutorial
 * This file demonstrates how to create custom MCP server adapters
 */

import { createScopedLogger } from '~/utils/logger';
import { ConnectionStatus, IMCPServerAdapter, MCPServerConfig, MCPTool } from '../config';
import { BaseMCPServerAdapter } from '../adapters';

const logger = createScopedLogger('MCPAdapterTutorial');

/**
 * Example custom MCP server adapter for a weather API
 * Demonstrates how to create a custom adapter for a non-standard MCP server
 */
export class WeatherApiAdapter extends BaseMCPServerAdapter {
  private _apiKey: string | null = null;

  constructor(
    id: string = 'weather',
    name: string = 'Weather API',
    baseUrl: string = 'https://api.weatherapi.com/v1',
    enabled: boolean = true,
    config: Partial<MCPServerConfig> = {},
  ) {
    super(id, name, baseUrl, enabled, config);

    // Extract API key from config
    this._apiKey = config.auth?.token || null;
  }

  /**
   * Initialize the adapter
   */
  async initialize(): Promise<void> {
    logger.info(`Initializing Weather API adapter: ${this.name}`);

    if (!this._apiKey) {
      logger.warn('Weather API key not provided. Weather adapter will be disabled.');
      this.enabled = false;

      return;
    }

    // Test the connection
    const status = await this.testConnection();

    if (status.success) {
      logger.info('Successfully connected to Weather API');
    } else {
      logger.warn(`Could not connect to Weather API: ${status.message}`);
      this.enabled = false;
    }
  }

  /**
   * Get tool definitions
   * This is where you define the tools your adapter provides
   */
  async getToolDefinitions(): Promise<MCPTool[]> {
    // Define the tools this adapter provides
    return [
      {
        name: 'get_current_weather',
        description: 'Get current weather conditions for a location',
        inputSchema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'Location name, city, US/UK/Canada postal code, or latitude,longitude',
            },
          },
          required: ['location'],
        },
      },
      {
        name: 'get_weather_forecast',
        description: 'Get weather forecast for a location',
        inputSchema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'Location name, city, US/UK/Canada postal code, or latitude,longitude',
            },
            days: {
              type: 'number',
              description: 'Number of days of forecast (1-10)',
              minimum: 1,
              maximum: 10,
            },
          },
          required: ['location'],
        },
      },
    ];
  }

  /**
   * Test the connection to the server
   */
  async testConnection(): Promise<ConnectionStatus> {
    if (!this._apiKey) {
      return {
        success: false,
        message: 'Weather API key not provided',
      };
    }

    try {
      // Create an abort controller with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      // Test the API with a simple request
      const response = await fetch(`${this.baseUrl}/current.json?key=${this._apiKey}&q=London`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          message: `Weather API error (${response.status}): ${errorText}`,
        };
      }

      return {
        success: true,
        message: 'Successfully connected to Weather API',
      };
    } catch (error) {
      logger.error('Weather API connection test failed:', error);
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
    if (!this._apiKey) {
      throw new Error('Weather API key not available');
    }

    try {
      switch (toolName) {
        case 'get_current_weather':
          if (!args.location) {
            throw new Error('Location is required');
          }

          // Make API request
          const currentResponse = await fetch(
            `${this.baseUrl}/current.json?key=${this._apiKey}&q=${encodeURIComponent(args.location)}`,
          );

          if (!currentResponse.ok) {
            throw new Error(`Weather API error: ${currentResponse.status}`);
          }

          return await currentResponse.json();

        case 'get_weather_forecast':
          if (!args.location) {
            throw new Error('Location is required');
          }

          const days = args.days || 3; // Default to 3 days forecast

          // Make API request
          const forecastResponse = await fetch(
            `${this.baseUrl}/forecast.json?key=${this._apiKey}&q=${encodeURIComponent(args.location)}&days=${days}`,
          );

          if (!forecastResponse.ok) {
            throw new Error(`Weather API error: ${forecastResponse.status}`);
          }

          return await forecastResponse.json();

        default:
          throw new Error(`Unknown Weather API tool: ${toolName}`);
      }
    } catch (error) {
      logger.error(`Error executing Weather API tool ${toolName}:`, error);
      throw error;
    }
  }
}

/**
 * Example of how to register and use a custom adapter
 */
export async function createCustomAdapter() {
  try {
    // Import required modules
    const { MCPServerRegistry, MCPToolFactory } = await import('../index');

    // Get registry and tool factory instances
    const registry = MCPServerRegistry.getInstance();
    const toolFactory = MCPToolFactory.getInstance();

    // Create the weather API adapter
    const weatherAdapter = new WeatherApiAdapter('weather', 'Weather API', 'https://api.weatherapi.com/v1', true, {
      auth: {
        token: process.env.WEATHER_API_KEY || '',
      },
    });

    // Register the adapter with the registry
    registry.registerServer(weatherAdapter);

    // Initialize the adapter
    await weatherAdapter.initialize();

    // Get tool definitions
    const tools = await weatherAdapter.getToolDefinitions();
    logger.info(`Weather API adapter provides ${tools.length} tools`);

    // Create AI SDK tools for all adapters
    const aiTools = await toolFactory.createTools();
    logger.info(`Created ${Object.keys(aiTools).length} AI SDK tools`);

    // Generate tool descriptions for LLM prompts
    const toolDescription = await toolFactory.generateToolDescription();
    logger.info('Generated tool description for LLM prompts');

    return {
      registry,
      weatherAdapter,
      tools,
      aiTools,
      toolDescription,
    };
  } catch (error) {
    logger.error('Error creating custom adapter:', error);
    throw error;
  }
}

/**
 * Simple example of creating a minimal adapter
 */
export class MinimalAdapter implements IMCPServerAdapter {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;

  constructor(id: string, name: string, baseUrl: string) {
    this.id = id;
    this.name = name;
    this.baseUrl = baseUrl;
    this.enabled = true;
  }

  async getToolDefinitions(): Promise<MCPTool[]> {
    return [
      {
        name: 'hello',
        description: 'Says hello',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name to greet',
            },
          },
        },
      },
    ];
  }

  async testConnection(): Promise<ConnectionStatus> {
    return {
      success: true,
      message: 'Minimal adapter is always connected',
    };
  }

  async executeToolCall(toolName: string, args: any): Promise<any> {
    if (toolName === 'hello') {
      return { greeting: `Hello, ${args.name || 'world'}!` };
    }

    throw new Error(`Unknown tool: ${toolName}`);
  }

  async initialize(): Promise<void> {
    // Nothing to initialize
  }

  getConfig(): MCPServerConfig {
    return {
      baseUrl: this.baseUrl,
    };
  }

  updateConfig(config: Partial<MCPServerConfig>): void {
    if (config.baseUrl) {
      this.baseUrl = config.baseUrl;
    }
  }
}
