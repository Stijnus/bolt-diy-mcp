/**
 * MCP Client Usage Example
 * This file demonstrates how to use the MCP Client in your application
 */

import { initializeMCP, getMCPClients } from './init';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('MCPExample');

/**
 * Example function demonstrating MCP client usage
 * @param env Environment variables
 */
export async function mcpExample(env: Record<string, string | undefined> = {}): Promise<void> {
  try {
    // Initialize MCP
    logger.info('Initializing MCP...');

    const tools = await initializeMCP(env);

    // Check if any tools were loaded
    if (Object.keys(tools).length === 0) {
      logger.warn('No MCP tools available. Check your MCP server configuration.');
      return;
    }

    // Log available tools
    logger.info(`Available MCP tools: ${Object.keys(tools).join(', ')}`);

    // Get MCP clients
    const clients = getMCPClients(env);
    logger.info(`Available MCP clients: ${Object.keys(clients).join(', ')}`);

    /*
     * Example: Call a tool if available
     * Replace 'default_toolName' with an actual tool name from your MCP server
     */
    const exampleToolName = Object.keys(tools)[0];

    if (exampleToolName) {
      try {
        logger.info(`Calling example tool: ${exampleToolName}`);

        /*
         * Call the tool with example parameters
         * Note: Adjust the parameters based on the actual tool requirements
         */
        const result = await tools[exampleToolName].execute({
          // Example parameters - replace with actual required parameters
          param1: 'value1',
          param2: 'value2',
        });

        logger.info(`Tool result: ${result}`);
      } catch (error) {
        logger.error(`Error calling tool ${exampleToolName}:`, error);
      }
    }
  } catch (error) {
    logger.error('Error in MCP example:', error);
  }
}

/**
 * How to use this example:
 *
 * 1. Import the example function:
 *    import { mcpExample } from '~/lib/modules/mcp/example';
 *
 * 2. Call the function with environment variables:
 *    await mcpExample(process.env);
 *
 * 3. Make sure you have MCP servers configured in your environment variables:
 *    MCP_SSE_DEFAULT=http://localhost:3001/sse
 */
