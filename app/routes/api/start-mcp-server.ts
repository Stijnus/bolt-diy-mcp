import { json } from '@remix-run/node';
import { spawn } from 'child_process';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('StartMcpServer');

/**
 * API endpoint to start the MCP test server
 */
export async function action({ request }: { request: Request }) {
  try {
    // Only allow POST requests
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, { status: 405 });
    }

    // Check if the server is already running
    try {
      // Create an abort controller with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 500);

      const response = await fetch('http://localhost:3001/', {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        // Server is already running
        return json({ success: true, message: 'MCP test server is already running' });
      }
    } catch (error: unknown) {
      // Server is not running, continue with starting it
      logger.info('MCP test server is not running, starting it now', { error });
    }

    // Start the MCP test server
    const serverProcess = spawn('node', ['simple-server.js'], {
      cwd: process.cwd() + '/mcp-test-server',
      detached: true,
      stdio: 'ignore',
    });

    // Detach the process so it continues running after this request completes
    serverProcess.unref();

    // Wait a moment to see if the server starts successfully
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Check if the server started successfully
    try {
      // Create an abort controller with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 500);

      const response = await fetch('http://localhost:3001/', {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        // Server started successfully
        logger.info('MCP test server started successfully');
        return json({ success: true, message: 'MCP test server started successfully' });
      } else {
        // Server failed to start
        logger.error('MCP test server failed to start');
        return json({ error: 'Failed to start MCP test server' }, { status: 500 });
      }
    } catch (error: unknown) {
      // Server failed to start
      logger.error('MCP test server failed to start:', error);
      return json({ error: 'Failed to start MCP test server' }, { status: 500 });
    }
  } catch (error: unknown) {
    logger.error('Error starting MCP test server:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
