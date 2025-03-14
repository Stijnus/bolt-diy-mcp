/**
 * Example of MCP Server Registry
 * Demonstrates how to use the new modular architecture for MCP servers
 */

import { createScopedLogger } from '~/utils/logger';
import {
  createServerAdapter,
  MCPServerRegistry,
  MCPToolFactory,
  MCPRegistryEventType,
  getMCPToolsDescription,
} from '../index';
import { StandardMCPServerAdapter, GitHubMCPServerAdapter } from '../adapters';

const logger = createScopedLogger('MCPRegistryExample');

/**
 * Run the example
 */
export async function runRegistryExample() {
  try {
    logger.info('Starting MCP Registry Example...');

    // Get the registry instance
    const registry = MCPServerRegistry.getInstance();

    // Subscribe to registry events
    registry.subscribe(MCPRegistryEventType.SERVER_ADDED, (event) => {
      logger.info(`Server added: ${event.serverId}`);
    });

    registry.subscribe(MCPRegistryEventType.SERVER_STATUS_CHANGED, (event) => {
      logger.info(`Server status changed: ${event.serverId}`, event.data);
    });

    // Create and register a test server adapter
    const testAdapter = createServerAdapter('test', 'Test Server', 'http://localhost:3001/sse', true);

    registry.registerServer(testAdapter);

    // Create and register a GitHub adapter
    const githubAdapter = new GitHubMCPServerAdapter('github', 'GitHub', 'https://api.github.com', true, {
      auth: {
        token: process.env.GITHUB_TOKEN || '',
        type: 'github',
      },
    });

    registry.registerServer(githubAdapter);

    // Initialize all servers
    await registry.initializeAll();

    // Get the tool factory
    const toolFactory = MCPToolFactory.getInstance();

    // Create tools for AI SDK
    const tools = await toolFactory.createTools({
      onToolCall: (serverId, toolName, args, resultPromise) => {
        logger.info(`Tool called: ${toolName} on server ${serverId}`);

        // Example: Log the result when it's available
        resultPromise.then(
          (result) => logger.info(`Tool result: ${result.substring(0, 100)}...`),
          (error) => logger.error(`Tool error: ${error}`),
        );
      },
    });

    logger.info(`Created ${Object.keys(tools).length} tools`);

    // Generate tool descriptions for LLM
    const toolDescription = await toolFactory.generateToolDescription();

    logger.info('Tool description for LLM:');
    logger.info(toolDescription);

    // Example: Get tool description from the convenience function
    const toolDescriptionFromFunction = await getMCPToolsDescription();

    // These should be identical
    if (toolDescription === toolDescriptionFromFunction) {
      logger.info('Both tool description methods produce identical results');
    }

    // Execute a tool if available
    if (Object.keys(tools).length > 0) {
      const sampleToolName = Object.keys(tools)[0];

      try {
        logger.info(`Executing sample tool: ${sampleToolName}`);

        const result = await tools[sampleToolName].execute({});
        logger.info(`Sample tool execution result: ${result}`);
      } catch (error) {
        logger.error(`Error executing sample tool: ${error}`);
      }
    }

    logger.info('MCP Registry Example completed successfully');
  } catch (error) {
    logger.error('Error in MCP Registry Example:', error);
  }
}

/**
 * Example code showing how to use the registry in an application
 * This is meant as a reference and not to be executed directly
 */
export function exampleUsage() {
  // This is reference code only, not meant to be executed

  // Initialize MCP in your application bootstrap
  async function initializeApp() {
    // Initialize MCP registry from environment and localStorage
    const { initializeMCPWithRegistry } = await import('../index');
    const registry = await initializeMCPWithRegistry();

    // Get the tool factory
    const { MCPToolFactory } = await import('../index');
    const toolFactory = MCPToolFactory.getInstance();

    // Create AI SDK tools
    const mcpTools = await toolFactory.createTools();

    // Register tools with the LLM system
    registerToolsWithLLM(mcpTools);

    // Generate tool descriptions for LLM prompts
    const toolDescription = await toolFactory.generateToolDescription();

    // Add to system prompt
    appendToSystemPrompt(toolDescription);
  }

  // Mock functions to show integration
  function registerToolsWithLLM(tools: any) {
    // Register tools with the LLM service
    console.log(`Registered ${Object.keys(tools).length} MCP tools with LLM`);
  }

  function appendToSystemPrompt(description: string) {
    // Add tool descriptions to the system prompt
    console.log(`Added ${description.length} characters to system prompt`);
  }
}
