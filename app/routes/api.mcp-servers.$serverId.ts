/**
 * API route for MCP server-specific operations
 * Route: /api/mcp-servers/:serverId
 */

import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { createScopedLogger } from '~/utils/logger';
import { MCPRuntimeManager } from '~/lib/modules/mcp/runtime-manager';

const logger = createScopedLogger('api.mcp-servers.serverId');

interface UpdateServerRequest {
  name?: string;
  baseUrl?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
}

function isUpdateServerRequest(body: unknown): body is UpdateServerRequest {
  if (typeof body !== 'object' || body === null) {
    return false;
  }

  const b = body as Record<string, unknown>;

  return (
    (typeof b.name === 'undefined' || typeof b.name === 'string') &&
    (typeof b.baseUrl === 'undefined' || typeof b.baseUrl === 'string') &&
    (typeof b.config === 'undefined' || (typeof b.config === 'object' && b.config !== null)) &&
    (typeof b.enabled === 'undefined' || typeof b.enabled === 'boolean')
  );
}

/**
 * Loader function for GET requests
 */
export async function loader({ params }: LoaderFunctionArgs) {
  try {
    // Get the runtime manager
    const runtimeManager = MCPRuntimeManager.getInstance();

    // Get server status
    const serverStatus = runtimeManager.getServerStatus(params.serverId!);

    if (!serverStatus) {
      return json({ error: 'Server not found' }, { status: 404 });
    }

    return json({ server: serverStatus });
  } catch (error) {
    logger.error('Error handling MCP server GET request:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Action function for PUT/DELETE requests
 */
export async function action({ request, params }: ActionFunctionArgs) {
  try {
    // Get the runtime manager
    const runtimeManager = MCPRuntimeManager.getInstance();

    // Process based on request method
    switch (request.method) {
      case 'PUT': {
        const body = await request.json();

        if (!isUpdateServerRequest(body)) {
          return json({ error: 'Invalid request body format' }, { status: 400 });
        }

        if (!body.name && !body.baseUrl && !body.config && body.enabled === undefined) {
          return json({ error: 'No fields to update' }, { status: 400 });
        }

        return handlePutRequest(body, params.serverId!, runtimeManager);
      }

      case 'DELETE': {
        return handleDeleteRequest(params.serverId!, runtimeManager);
      }

      default:
        return json({ error: 'Method not allowed' }, { status: 405 });
    }
  } catch (error) {
    logger.error('Error handling MCP server request:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Handle PUT requests (update server)
 */
async function handlePutRequest(body: UpdateServerRequest, serverId: string, runtimeManager: MCPRuntimeManager) {
  try {
    // Check if enabling/disabling
    if ('enabled' in body) {
      // Enable or disable the server
      await runtimeManager.setServerEnabled(serverId, !!body.enabled);

      const serverStatus = runtimeManager.getServerStatus(serverId);

      if (!serverStatus) {
        return json({ error: 'Server not found' }, { status: 404 });
      }

      return json({
        success: true,
        message: `Server ${serverStatus.name} ${body.enabled ? 'enabled' : 'disabled'} successfully`,
        server: serverStatus,
      });
    } else {
      // Update server configuration
      const updates: { name?: string; baseUrl?: string; config?: Record<string, unknown> } = {};

      if (body.name) {
        updates.name = body.name;
      }

      if (body.baseUrl) {
        updates.baseUrl = body.baseUrl;
      }

      if (body.config) {
        updates.config = body.config;
      }

      await runtimeManager.updateServer(serverId, updates);

      const serverStatus = runtimeManager.getServerStatus(serverId);

      if (!serverStatus) {
        return json({ error: 'Server not found' }, { status: 404 });
      }

      return json({
        success: true,
        message: `Server ${serverStatus.name} updated successfully`,
        server: serverStatus,
      });
    }
  } catch (error) {
    logger.error('Error updating MCP server:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return json({ error: errorMessage }, { status: 400 });
  }
}

/**
 * Handle DELETE requests (remove server)
 */
async function handleDeleteRequest(serverId: string, runtimeManager: MCPRuntimeManager) {
  try {
    const serverStatus = runtimeManager.getServerStatus(serverId);

    if (!serverStatus) {
      return json({ error: 'Server not found' }, { status: 404 });
    }

    // Remove the server
    runtimeManager.removeServer(serverId);

    return json({
      success: true,
      message: `Server ${serverStatus.name} removed successfully`,
    });
  } catch (error) {
    logger.error('Error removing MCP server:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return json({ error: errorMessage }, { status: 400 });
  }
}
