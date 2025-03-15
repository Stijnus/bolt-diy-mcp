/**
 * GitHub MCP Server Adapter
 * Implementation for GitHub API integration through MCP
 */

import { createScopedLogger } from '~/utils/logger';
import type { ConnectionStatus, MCPTool, MCPServerConfig } from '~/lib/modules/mcp/config';
import { BaseMCPServerAdapter } from './base-adapter';

const logger = createScopedLogger('MCPGitHubAdapter');

interface GitHubErrorResponse {
  message?: string;
  documentation_url?: string;
}

/**
 * GitHub MCP Server Adapter
 * Adapter for GitHub API integration
 */
export class GitHubMCPServerAdapter extends BaseMCPServerAdapter {
  private _token: string | null = null;
  private _connected: boolean = false;
  private _authenticatedUser: any = null;

  constructor(
    id: string = 'github',
    name: string = 'GitHub',
    baseUrl: string = 'https://api.github.com',
    enabled: boolean = true,
    config: any = {},
  ) {
    super(id, name, baseUrl, enabled, config);

    // Extract token from config using multiple possible paths
    if (config.auth?.token) {
      this._token = config.auth.token;
      logger.info('GitHub token provided from config.auth.token');
    } else if (config.token) {
      // Try direct token property
      this._token = config.token;
      logger.info('GitHub token provided from config.token');
    } else {
      // Check for environment variables - this is a common pattern
      const envToken =
        typeof process !== 'undefined' && process.env
          ? process.env.GITHUB_TOKEN || process.env.MCP_GITHUB_TOKEN
          : undefined;

      if (envToken) {
        this._token = envToken;
        logger.info('GitHub token provided from environment variable');
      } else {
        // Try to read from localStorage directly
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            const storedData = window.localStorage.getItem('mcp_servers');

            if (storedData) {
              const servers = JSON.parse(storedData);
              const githubServer = servers.find(
                (s: any) =>
                  s.name.toLowerCase() === 'github' ||
                  s.baseUrl.includes('github') ||
                  (s.auth && s.auth.type === 'github'),
              );

              if (githubServer && githubServer.auth && githubServer.auth.token) {
                this._token = githubServer.auth.token;
                logger.info('GitHub token provided from localStorage');
              }
            }
          }
        } catch (e) {
          logger.error('Error trying to read token from localStorage', e);
        }

        // If we still don't have a token, log a warning
        if (!this._token) {
          logger.warn('No GitHub token found in configuration or environment variables');
        }

        if (!this._token) {
          // Log the missing token info for debugging
          logger.warn('No GitHub token found in MCP server configuration', {
            id,
            name,
            baseUrl,
            config: JSON.stringify(config, null, 2),
          });
        }
      }
    }
  }

  /**
   * Initialize the server adapter
   */
  async initialize(): Promise<void> {
    logger.info(`Initializing GitHub MCP server adapter: ${this.name}`);

    if (!this._token) {
      logger.warn('GitHub token not provided. GitHub adapter will be disabled.');
      this.enabled = false;

      return;
    }

    try {
      // Test connection by getting user info
      const status = await this.testConnection();

      if (status.success) {
        this._connected = true;
        logger.info(`Successfully connected to GitHub API as ${this._authenticatedUser?.login}`);
      } else {
        this._connected = false;
        logger.warn(`Could not connect to GitHub API: ${status.message}`);
      }
    } catch (error) {
      logger.error(`Failed to initialize GitHub MCP adapter:`, error);
      this._connected = false;
    }
  }

  /**
   * Test the connection to this server
   */
  async testConnection(): Promise<ConnectionStatus> {
    // Double-check if token is available
    if (!this._token) {
      logger.warn('No GitHub token found when testing connection - attempting to retrieve');

      // Try to read from localStorage again
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const storedData = window.localStorage.getItem('mcp_servers');

          if (storedData) {
            const servers = JSON.parse(storedData);
            const githubServer = servers.find(
              (s: any) =>
                s.name.toLowerCase() === 'github' ||
                s.baseUrl.includes('github') ||
                (s.auth && s.auth.type === 'github'),
            );

            if (githubServer && githubServer.auth && githubServer.auth.token) {
              this._token = githubServer.auth.token;
              logger.info('GitHub token retrieved from localStorage during connection test');
            }
          }
        }
      } catch (e) {
        logger.error('Error trying to read token from localStorage during connection test', e);
      }

      // Try to get token from config again
      if (!this._token && this._config.auth?.token) {
        this._token = this._config.auth.token;
        logger.info('GitHub token retrieved from config during connection test');
      }

      if (!this._token) {
        return {
          success: false,
          message: 'No GitHub token found. Please configure a valid token.',
        };
      }
    }

    // Final check and warning
    if (!this._token) {
      logger.warn('No GitHub token found in MCP server configuration when testing connection', {
        id: this.id,
        name: this.name,
        baseUrl: this.baseUrl,
        configHasAuth: !!this._config.auth,
        configAuthHasToken: !!(this._config.auth && this._config.auth.token),
        tokenPrefix: this._config.auth?.token ? this._config.auth.token.substring(0, 8) + '...' : undefined,
      });

      return {
        success: false,
        message: 'GitHub token not provided',
      };
    }

    try {
      // Create an abort controller with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.baseUrl}/user`, {
        headers: {
          Authorization: `Bearer ${this._token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'MCP-GitHub-Adapter',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as GitHubErrorResponse | null;

        return {
          success: false,
          message: `GitHub API error (${response.status}): ${errorData?.message || (await response.text()) || 'Unknown error'}`,
        };
      }

      // Store user info for later use
      this._authenticatedUser = await response.json();

      return {
        success: true,
        message: `Connected to GitHub API as ${this._authenticatedUser.login}`,
      };
    } catch (error) {
      logger.error('GitHub connection test failed:', error);
      return {
        success: false,
        message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get the list of tools provided by this server
   */
  async getToolDefinitions(): Promise<MCPTool[]> {
    // GitHub adapter provides fixed set of tools (GitHub API methods)
    const tools: MCPTool[] = [
      {
        name: 'github_get_user',
        description: 'Get information about the authenticated GitHub user',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'github_list_repositories',
        description: 'List repositories for the authenticated GitHub user',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'github_search_repositories',
        description: 'Search for GitHub repositories by query',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'github_get_repository_contents',
        description: 'Get contents of a file or directory in a GitHub repository',
        inputSchema: {
          type: 'object',
          properties: {
            owner: {
              type: 'string',
              description: 'Repository owner (username or organization)',
            },
            repo: {
              type: 'string',
              description: 'Repository name',
            },
            path: {
              type: 'string',
              description: 'Path to file or directory (optional)',
            },
          },
          required: ['owner', 'repo'],
        },
      },
      {
        name: 'github_create_repository',
        description: 'Create a new GitHub repository',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Repository name',
            },
            description: {
              type: 'string',
              description: 'Repository description',
            },
            private: {
              type: 'boolean',
              description: 'Whether the repository should be private',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'github_request',
        description: 'Make a custom GitHub API request',
        inputSchema: {
          type: 'object',
          properties: {
            endpoint: {
              type: 'string',
              description: 'API endpoint (e.g., /user/repos)',
            },
            method: {
              type: 'string',
              description: 'HTTP method (GET, POST, PUT, DELETE, etc.)',
              enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
            },
            body: {
              type: 'object',
              description: 'Request body for POST, PUT, PATCH requests',
            },
          },
          required: ['endpoint'],
        },
      },
    ];

    return tools;
  }

  /**
   * Make a request to the GitHub API
   */
  private async _request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this._token) {
      throw new Error('GitHub token not available');
    }

    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const headers = new Headers(options.headers || {});
        headers.set('Authorization', `Bearer ${this._token}`);
        headers.set('Accept', 'application/vnd.github.v3+json');
        headers.set('Content-Type', 'application/json');
        headers.set('User-Agent', 'MCP-GitHub-Adapter');

        const response = await fetch(url, {
          ...options,
          headers,
        });

        if (!response.ok) {
          const errorData = (await response.json().catch(() => null)) as GitHubErrorResponse | null;
          const errorMessage = errorData?.message || (await response.text()) || 'Unknown error';
          throw new Error(`GitHub API error (${response.status}): ${errorMessage}`);
        }

        const responseData = await response.json();
        logger.debug('GitHub API response:', responseData);

        return responseData as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.error(`GitHub API request attempt ${attempt}/${maxRetries} failed:`, error);

        if (attempt < maxRetries) {
          const backoffTime = Math.pow(2, attempt - 1) * 1000;
          logger.info(`Retrying GitHub API request in ${backoffTime}ms...`);
          await new Promise((resolve) => setTimeout(resolve, backoffTime));
        }
      }
    }

    throw lastError || new Error(`Failed after ${maxRetries} attempts`);
  }

  /**
   * Execute a tool call
   * @param toolName Name of the tool to execute
   * @param args Arguments for the tool
   */
  async executeToolCall(toolName: string, args: any): Promise<any> {
    logger.info(`GitHub adapter executing tool: ${toolName}`, {
      args: JSON.stringify(args),
      token_available: !!this._token,
      token_length: this._token ? this._token.length : 0,
      token_prefix: this._token ? this._token.substring(0, 8) + '...' : undefined,
    });

    // Validate token availability
    if (!this._token) {
      logger.error('GitHub token not available for tool execution', {
        toolName,
        args: JSON.stringify(args),
        adapter_id: this.id,
        adapter_name: this.name,
        baseUrl: this.baseUrl,
      });
      throw new Error('GitHub token not available. Please configure a valid token in the MCP server settings.');
    }

    try {
      switch (toolName) {
        case 'github_get_user':
          return this._request<any>('/user');

        case 'github_list_repositories':
          return this._request<any[]>('/user/repos');

        case 'github_search_repositories':
          if (!args.query) {
            throw new Error('Search query is required');
          }

          return this._request<any>(`/search/repositories?q=${encodeURIComponent(args.query)}`);

        case 'github_get_repository_contents': {
          if (!args.owner || !args.repo) {
            throw new Error('Repository owner and name are required');
          }

          const path = args.path || '';

          return this._request<any>(`/repos/${args.owner}/${args.repo}/contents/${path}`);
        }

        case 'github_create_repository':
          if (!args.name) {
            throw new Error('Repository name is required');
          }

          return this._request<any>('/user/repos', {
            method: 'POST',
            body: JSON.stringify({
              name: args.name,
              description: args.description || '',
              private: args.private || false,
            }),
          });

        case 'github_request': {
          if (!args.endpoint) {
            throw new Error('API endpoint is required');
          }

          const options: RequestInit = {
            method: args.method || 'GET',
          };

          if (args.body && (options.method === 'POST' || options.method === 'PUT' || options.method === 'PATCH')) {
            options.body = JSON.stringify(args.body);
          }

          return this._request<any>(args.endpoint, options);
        }

        default:
          throw new Error(`Unknown GitHub tool: ${toolName}`);
      }
    } catch (error) {
      logger.error(`Error executing GitHub tool ${toolName}:`, error);
      throw error;
    }
  }

  updateConfig(config: Partial<MCPServerConfig>): void {
    // Update base configuration
    super.updateConfig(config);

    // Update token if auth configuration changes
    if (config.auth?.token) {
      this._token = config.auth.token;
      logger.info('GitHub token updated');
    }
  }
}
