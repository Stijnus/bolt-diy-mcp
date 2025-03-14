/**
 * GitHub MCP Server Adapter
 * Implementation for GitHub API integration through MCP
 */

import { createScopedLogger } from '~/utils/logger';
import type { ConnectionStatus, MCPTool } from '~/lib/modules/mcp/config';
import { BaseMCPServerAdapter } from './base-adapter';

const logger = createScopedLogger('MCPGitHubAdapter');

/**
 * GitHub API client interface
 */
interface GitHubClient {
  getUser(): Promise<any>;
  listRepositories(): Promise<any[]>;
  searchRepositories(query: string): Promise<any>;
  getRepositoryContents(owner: string, repo: string, path?: string): Promise<any>;
  createRepository(name: string, options?: any): Promise<any>;
  request<T>(endpoint: string, options?: RequestInit): Promise<T>;
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

    // Extract token from config if available
    if (config.auth?.token && config.auth?.type === 'github') {
      this._token = config.auth.token;
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
   * Test the connection to this server
   */
  async testConnection(): Promise<ConnectionStatus> {
    if (!this._token) {
      return {
        success: false,
        message: 'GitHub token not provided',
      };
    }

    try {
      // Create an abort controller with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `token ${this._token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          message: `GitHub API error (${response.status}): ${errorText}`,
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
   * Make a request to the GitHub API
   * @param endpoint The API endpoint (e.g., '/user/repos')
   * @param options Fetch options
   * @returns The response data
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
        headers.set('Authorization', `token ${this._token}`);
        headers.set('Accept', 'application/vnd.github+json');
        headers.set('X-GitHub-Api-Version', '2022-11-28');

        const response = await fetch(url, {
          ...options,
          headers,
        });

        // Check for rate limiting
        if (response.status === 403 && response.headers.get('X-RateLimit-Remaining') === '0') {
          const resetTime = response.headers.get('X-RateLimit-Reset');
          const resetDate = resetTime ? new Date(parseInt(resetTime) * 1000) : new Date();

          throw new Error(`GitHub API rate limit exceeded. Resets at ${resetDate.toLocaleTimeString()}`);
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`GitHub API error (${response.status}): ${errorText}`);
        }

        return response.json() as Promise<T>;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Log the error
        logger.error(`GitHub API request attempt ${attempt}/${maxRetries} failed:`, error);

        // If this is not the last attempt, wait before retrying
        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s, etc.
          const backoffTime = Math.pow(2, attempt - 1) * 1000;
          logger.info(`Retrying GitHub API request in ${backoffTime}ms...`);
          await new Promise((resolve) => setTimeout(resolve, backoffTime));
        }
      }
    }

    // If we've exhausted all retries, throw the last error
    throw new Error(`Failed after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Execute a tool call
   * @param toolName Name of the tool to execute
   * @param args Arguments for the tool
   */
  async executeToolCall(toolName: string, args: any): Promise<any> {
    if (!this._token) {
      throw new Error('GitHub token not available');
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
      throw new Error(
        `Failed to execute GitHub tool ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
