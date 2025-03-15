import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import { createScopedLogger } from '~/utils/logger';
import { MCPServerRegistry } from '~/lib/modules/mcp/registry';
import { MCPToolFactory } from '~/lib/modules/mcp/tool-factory';

const logger = createScopedLogger('MCPToolsAPI');

interface GitHubApiArgs {
  method?: string;
  args?: Record<string, unknown>;
}

type ToolArgs = string | GitHubApiArgs | Record<string, unknown>;

// GitHub method mapping
const githubMethodMap: Record<string, string> = {
  getUser: 'github_get_user',
  listRepositories: 'github_list_repositories',
  searchRepositories: 'github_search_repositories',
  getRepositoryContents: 'github_get_repository_contents',
  createRepository: 'github_create_repository',
  request: 'github_request',
};

/**
 * Execute an MCP tool
 * POST /api/mcp/tools/:toolName
 */
export async function action({ request, params }: ActionFunctionArgs) {
  try {
    const toolName = params.toolName;

    if (!toolName) {
      return json({ error: 'Tool name is required' }, { status: 400 });
    }

    // Get tool arguments from request body and type cast
    const args = (await request.json()) as ToolArgs;

    // Get registry instance
    const registry = MCPServerRegistry.getInstance();

    // Handle special case for github_api (which is a special unified tool)
    if (toolName === 'github_api') {
      // Try to get GitHub server
      let githubServer = registry.getServer('github');

      // If server not found, create it with the token from environment
      if (!githubServer) {
        logger.info('GitHub server not found, creating one with environment token');

        // Import adapter creation tools
        const { createServerAdapter } = await import('~/lib/modules/mcp/adapters');

        const githubToken = process.env.GITHUB_TOKEN;

        if (!githubToken) {
          throw new Error('GITHUB_TOKEN environment variable is not set');
        }

        // Create a GitHub adapter with the token from environment
        githubServer = createServerAdapter('github', 'GitHub MCP', 'https://api.github.com', true, {
          auth: {
            token: githubToken,
            type: 'github',
          },
        });

        // Register it
        registry.registerServer(githubServer);

        // Initialize it
        await githubServer.initialize();
      } else {
        // Check if the server has a token, if not, add it from environment
        try {
          const config = githubServer.getConfig();

          if (!config.auth?.token) {
            logger.info('Found GitHub server but no token, adding token from environment');

            const githubToken = process.env.GITHUB_TOKEN;

            if (!githubToken) {
              throw new Error('GITHUB_TOKEN environment variable is not set');
            }

            githubServer.updateConfig({
              auth: {
                token: githubToken,
                type: 'github',
              },
            });
          }
        } catch (e) {
          logger.error('Error checking/updating GitHub server config:', e);
        }
      }

      // Execute tool
      try {
        /*
         * Handle function-style methods from github_api
         * If args is a string, assume it's a method name
         */
        if (typeof args === 'string') {
          // Convert string to method
          const methodName = args.trim();

          // Map method to the correct tool name
          const mappedToolName = githubMethodMap[methodName] || `github_${methodName}`;
          logger.info(`Mapped github_api string method ${methodName} to tool ${mappedToolName}`);

          // Execute with empty args
          const result = await githubServer.executeToolCall(mappedToolName, {});

          return json(result);
        }

        // Handle object with method property
        const isGitHubArgs = (arg: unknown): arg is GitHubApiArgs => {
          return typeof arg === 'object' && arg !== null && 'method' in arg;
        };

        if (isGitHubArgs(args)) {
          // Map method to the correct tool name
          const mappedToolName = args.method ? githubMethodMap[args.method] || `github_${args.method}` : toolName;
          logger.info(`Mapped github_api method ${args.method} to tool ${mappedToolName}`);

          // Pass the arguments through
          const result = await githubServer.executeToolCall(mappedToolName, args.args || {});

          return json(result);
        } else {
          // Fall back to direct execution
          const result = await githubServer.executeToolCall(toolName, args as Record<string, unknown>);
          return json(result);
        }
      } catch (toolError) {
        logger.error('Error executing GitHub tool:', toolError);
        return json(
          {
            error: toolError instanceof Error ? toolError.message : 'Tool execution failed',
            details: toolError,
          },
          { status: 500 },
        );
      }
    }

    // Check if this is a standard GitHub tool
    else if (toolName.startsWith('github_')) {
      // Get GitHub server
      const githubServer = registry.getServer('github');

      if (!githubServer) {
        throw json({ error: 'GitHub server not found' }, { status: 404 });
      }

      // Execute tool
      try {
        const result = await githubServer.executeToolCall(toolName, args);
        return json(result);
      } catch (toolError) {
        logger.error('Error executing GitHub tool:', toolError);
        return json(
          {
            error: toolError instanceof Error ? toolError.message : 'Tool execution failed',
            details: toolError,
          },
          { status: 500 },
        );
      }
    }

    // For other tools, find the appropriate server
    const toolFactory = MCPToolFactory.getInstance();
    const serverTools = await toolFactory.getAvailableTools();
    let matchingServer = null;

    for (const [serverId, tools] of Object.entries(serverTools)) {
      if (tools.some((t) => t.name === toolName)) {
        matchingServer = registry.getServer(serverId);
        break;
      }
    }

    if (!matchingServer) {
      return json({ error: `No server found that provides tool: ${toolName}` }, { status: 404 });
    }

    // Execute the tool
    try {
      const result = await matchingServer.executeToolCall(toolName, args);

      return json({ result });
    } catch (toolError) {
      logger.error('Error executing tool:', toolError);
      return json(
        {
          error: toolError instanceof Error ? toolError.message : 'Tool execution failed',
          details: toolError,
        },
        { status: 500 },
      );
    }
  } catch (error) {
    logger.error('Error handling MCP tool request:', error);
    return json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error,
      },
      { status: 500 },
    );
  }
}

// Optionally handle GET requests to list available tools
export async function loader({ params }: { params: { toolName: string } }) {
  try {
    const toolName = params.toolName;
    const [serverName] = toolName.split('_');

    const registry = MCPServerRegistry.getInstance();
    const server = registry.getServer(serverName);

    if (!server) {
      return json({ error: `Server not found: ${serverName}` }, { status: 404 });
    }

    const tools = await server.getToolDefinitions();

    return json({ tools });
  } catch (error) {
    logger.error('Error getting tool definitions:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
