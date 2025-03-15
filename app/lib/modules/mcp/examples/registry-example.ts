/**
 * Example of MCP Server Registry
 * Demonstrates how to use the new modular architecture for MCP servers
 */

import { createScopedLogger } from '~/utils/logger';
import { createServerAdapter, MCPServerRegistry, MCPToolFactory, MCPRegistryEventType } from '~/lib/modules/mcp';
import { GitHubMCPServerAdapter } from '~/lib/modules/mcp/adapters';

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
      onToolCall: (
        serverId: string,
        toolName: string,
        args: Record<string, unknown>,
        resultPromise: Promise<string>,
      ) => {
        logger.info(`Tool called: ${toolName} on server ${serverId}`);

        // Example: Log the result when it's available
        resultPromise.then(
          (result: string) => logger.info(`Tool result: ${result.substring(0, 100)}...`),
          (error: Error) => logger.error(`Tool error: ${error}`),
        );
      },
    });

    logger.info(`Created ${Object.keys(tools).length} tools`);

    // Generate tool descriptions for LLM
    const toolDescription = await toolFactory.generateToolDescription();

    logger.info('Tool description for LLM:');
    logger.info(toolDescription);

    // Execute a sample tool
    const sampleToolName = Object.keys(tools)[0];

    if (sampleToolName && tools[sampleToolName] && tools[sampleToolName].execute) {
      const result = await tools[sampleToolName].execute(
        {},
        {
          toolCallId: `example-tool-${Date.now()}`,
          messages: [],
        },
      );
      console.log(`Tool execution result:`, result);
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

  // Mock functions to show integration
  function registerToolsWithLLM(tools: any) {
    // Register tools with the LLM service
    console.log(`Registered ${Object.keys(tools).length} MCP tools with LLM`);
  }

  function appendToSystemPrompt(description: string) {
    // Add tool descriptions to the system prompt
    console.log(`Added ${description.length} characters to system prompt`);
  }

  // Example usage of the functions
  registerToolsWithLLM({});
  appendToSystemPrompt('example description');
}
