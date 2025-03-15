/**
 * API route for MCP server management
 * Route: /api/mcp-servers
 */

import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';
import { MCPRuntimeManager } from '~/lib/modules/mcp/runtime-manager';
import type { ServerStatus } from '~/lib/hooks/useMCPServers';

const logger = createScopedLogger('api.mcp-servers');

interface AddServerRequest {
  name: string;
  baseUrl: string;
  config?: Record<string, unknown>;
}

interface UpdateServerRequest {
  serverId: string;
  name?: string;
  baseUrl?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
}

interface AutoDiscoverResponse {
  addedCount: number;
  servers: ServerStatus[];
}

function isAddServerRequest(body: unknown): body is AddServerRequest {
  if (typeof body !== 'object' || body === null) {
    return false;
  }

  const b = body as Record<string, unknown>;

  return (
    typeof b.name === 'string' &&
    typeof b.baseUrl === 'string' &&
    (typeof b.config === 'undefined' || (typeof b.config === 'object' && b.config !== null))
  );
}

function isUpdateServerRequest(body: unknown): body is UpdateServerRequest {
  if (typeof body !== 'object' || body === null) {
    return false;
  }

  const b = body as Record<string, unknown>;

  return (
    typeof b.serverId === 'string' &&
    (typeof b.name === 'undefined' || typeof b.name === 'string') &&
    (typeof b.baseUrl === 'undefined' || typeof b.baseUrl === 'string') &&
    (typeof b.config === 'undefined' || (typeof b.config === 'object' && b.config !== null)) &&
    (typeof b.enabled === 'undefined' || typeof b.enabled === 'boolean')
  );
}

/**
 * Loader function for GET requests
 */
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    // Get the runtime manager
    const runtimeManager = MCPRuntimeManager.getInstance();

    return handleGetRequest(request, runtimeManager);
  } catch (error) {
    logger.error('Error handling MCP servers API GET request:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Action function for the API route
 */
export async function action({ request }: ActionFunctionArgs) {
  try {
    // Get the runtime manager
    const runtimeManager = MCPRuntimeManager.getInstance();

    // Process based on request method
    switch (request.method) {
      case 'GET': {
        return handleGetRequest(request, runtimeManager);
      }

      case 'POST': {
        const body = await request.json();

        if (!isAddServerRequest(body)) {
          return json({ error: 'Invalid request body format' }, { status: 400 });
        }

        const serverId = await runtimeManager.addServer(body.name, body.baseUrl, body.config || {});
        const serverStatus = runtimeManager.getServerStatus(serverId);

        return json({
          success: true,
          message: `Server ${body.name} added successfully`,
          serverId,
          server: serverStatus,
        });
      }

      case 'PUT': {
        const body = await request.json();

        if (!isUpdateServerRequest(body)) {
          return json({ error: 'Invalid request body format' }, { status: 400 });
        }

        const serverId = body.serverId;

        if ('enabled' in body) {
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
      }

      case 'DELETE': {
        const url = new URL(request.url);
        const serverId = url.searchParams.get('serverId');

        if (!serverId) {
          return json({ error: 'Server ID is required' }, { status: 400 });
        }

        const serverStatus = runtimeManager.getServerStatus(serverId);
        const serverName = serverStatus?.name || serverId;

        runtimeManager.removeServer(serverId);

        return json({
          success: true,
          message: `Server ${serverName} removed successfully`,
        });
      }

      default:
        return json({ error: 'Method not allowed' }, { status: 405 });
    }
  } catch (error) {
    logger.error('Error handling MCP servers API request:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Handle GET requests
 * @param request Request object
 * @param runtimeManager Runtime manager instance
 * @returns Response
 */
async function handleGetRequest(request: Request, runtimeManager: MCPRuntimeManager) {
  // Get URL parameters
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const serverId = url.searchParams.get('serverId');

  switch (action) {
    case 'list': {
      const includeDisabled = url.searchParams.get('includeDisabled') === 'true';
      return json({
        servers: runtimeManager.getAllServerStatus(includeDisabled),
      });
    }

    case 'get': {
      if (!serverId) {
        return json({ error: 'Server ID is required' }, { status: 400 });
      }

      const serverStatus = runtimeManager.getServerStatus(serverId);

      if (!serverStatus) {
        return json({ error: 'Server not found' }, { status: 404 });
      }

      return json({ server: serverStatus });
    }

    case 'discover': {
      const port = parseInt(url.searchParams.get('port') || '3001', 10);
      const discoveredServers = await runtimeManager.discoverLocalServers(port);

      return json({ servers: discoveredServers });
    }

    case 'auto-discover': {
      const addedCount = await runtimeManager.autoDiscoverAndAddServers();

      return json({
        addedCount: addedCount ?? 0,
        servers: runtimeManager.getAllServerStatus(true),
      } satisfies AutoDiscoverResponse);
    }

    case 'refresh': {
      if (serverId) {
        await runtimeManager.refreshServerStatus(serverId);

        const serverStatus = runtimeManager.getServerStatus(serverId);

        if (!serverStatus) {
          return json({ error: 'Server not found' }, { status: 404 });
        }

        return json({ server: serverStatus });
      } else {
        await runtimeManager.refreshAllServerStatus();
        return json({
          servers: runtimeManager.getAllServerStatus(true),
        });
      }
    }

    default:
      return json({ error: 'Invalid action' }, { status: 400 });
  }
}
