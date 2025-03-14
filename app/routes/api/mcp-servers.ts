/**
 * API route for MCP server management
 */

import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';
import { MCPRuntimeManager } from '~/lib/modules/mcp/runtime-manager';

const logger = createScopedLogger('api.mcp-servers');

/**
 * Action function for the API route
 */
export async function action({ request }: ActionFunctionArgs) {
  try {
    // Get the runtime manager
    const runtimeManager = MCPRuntimeManager.getInstance();
    
    // Process based on request method
    switch (request.method) {
      case 'GET':
        return handleGetRequest(request, runtimeManager);
      
      case 'POST':
        return handlePostRequest(request, runtimeManager);
      
      case 'PUT':
        return handlePutRequest(request, runtimeManager);
      
      case 'DELETE':
        return handleDeleteRequest(request, runtimeManager);
      
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
    case 'list':
      // List all servers
      const includeDisabled = url.searchParams.get('includeDisabled') === 'true';
      return json({
        servers: runtimeManager.getAllServerStatus(includeDisabled),
      });
    
    case 'get':
      // Get a specific server
      if (!serverId) {
        return json({ error: 'Server ID is required' }, { status: 400 });
      }
      
      const serverStatus = runtimeManager.getServerStatus(serverId);
      
      if (!serverStatus) {
        return json({ error: 'Server not found' }, { status: 404 });
      }
      
      return json({ server: serverStatus });
    
    case 'discover':
      // Discover local servers
      const port = parseInt(url.searchParams.get('port') || '3001', 10);
      const discoveredServers = await runtimeManager.discoverLocalServers(port);
      
      return json({ servers: discoveredServers });
    
    case 'auto-discover':
      // Auto-discover and add servers
      const addedCount = await runtimeManager.autoDiscoverAndAddServers();
      
      return json({
        addedCount,
        servers: runtimeManager.getAllServerStatus(true),
      });
    
    case 'refresh':
      // Refresh server status
      if (serverId) {
        // Refresh specific server
        await runtimeManager.refreshServerStatus(serverId);
        const serverStatus = runtimeManager.getServerStatus(serverId);
        
        if (!serverStatus) {
          return json({ error: 'Server not found' }, { status: 404 });
        }
        
        return json({ server: serverStatus });
      } else {
        // Refresh all servers
        await runtimeManager.refreshAllServerStatus();
        return json({
          servers: runtimeManager.getAllServerStatus(true),
        });
      }
    
    default:
      return json({ error: 'Invalid action' }, { status: 400 });
  }
}

/**
 * Handle POST requests (add server)
 * @param request Request object
 * @param runtimeManager Runtime manager instance
 * @returns Response
 */
async function handlePostRequest(request: Request, runtimeManager: MCPRuntimeManager) {
  try {
    // Parse request body
    const body = await request.json();
    
    // Validate required fields
    if (!body.name || !body.baseUrl) {
      return json({ error: 'Name and baseUrl are required' }, { status: 400 });
    }
    
    // Add the server
    const serverId = await runtimeManager.addServer(body.name, body.baseUrl, body.config || {});
    
    // Get the server status
    const serverStatus = runtimeManager.getServerStatus(serverId);
    
    return json({
      success: true,
      message: `Server ${body.name} added successfully`,
      serverId,
      server: serverStatus,
    });
  } catch (error) {
    logger.error('Error adding MCP server:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: errorMessage }, { status: 400 });
  }
}

/**
 * Handle PUT requests (update server)
 * @param request Request object
 * @param runtimeManager Runtime manager instance
 * @returns Response
 */
async function handlePutRequest(request: Request, runtimeManager: MCPRuntimeManager) {
  try {
    // Parse request body
    const body = await request.json();
    
    // Validate server ID
    if (!body.serverId) {
      return json({ error: 'Server ID is required' }, { status: 400 });
    }
    
    const serverId = body.serverId;
    
    // Check if enabling/disabling
    if (body.hasOwnProperty('enabled')) {
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
      const updates: { name?: string; baseUrl?: string; config?: any } = {};
      
      if (body.name) updates.name = body.name;
      if (body.baseUrl) updates.baseUrl = body.baseUrl;
      if (body.config) updates.config = body.config;
      
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
 * @param request Request object
 * @param runtimeManager Runtime manager instance
 * @returns Response
 */
async function handleDeleteRequest(request: Request, runtimeManager: MCPRuntimeManager) {
  try {
    // Get URL parameters
    const url = new URL(request.url);
    const serverId = url.searchParams.get('serverId');
    
    // Validate server ID
    if (!serverId) {
      return json({ error: 'Server ID is required' }, { status: 400 });
    }
    
    // Get server name before removing
    const serverStatus = runtimeManager.getServerStatus(serverId);
    const serverName = serverStatus?.name || serverId;
    
    // Remove the server
    runtimeManager.removeServer(serverId);
    
    return json({
      success: true,
      message: `Server ${serverName} removed successfully`,
    });
  } catch (error) {
    logger.error('Error removing MCP server:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: errorMessage }, { status: 400 });
  }
}