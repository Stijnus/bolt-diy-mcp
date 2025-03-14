/**
 * GitHub MCP Integration
 * Provides utilities for working with the GitHub API through MCP
 */

import { createScopedLogger } from '~/utils/logger';
import { MCPManager } from './manager';

const logger = createScopedLogger('GitHubMCP');

/**
 * GitHub API client for MCP
 * Provides methods for interacting with the GitHub API
 */
export class GitHubMCPClient {
  private _token: string | null = null;
  private _baseUrl: string = 'https://api.github.com';

  /**
   * Create a new GitHub MCP client
   * @param serverName The name of the GitHub MCP server
   */
  constructor(private readonly _serverName: string = 'github') {
    this._loadToken();
  }

  /**
   * Load the GitHub token from the MCP server configuration
   */
  private _loadToken(): void {
    try {
      const mcpManager = MCPManager.getInstance();
      const serverConfig = mcpManager.getServerConfig(this._serverName);

      if (serverConfig?.auth?.type === 'github' && serverConfig.auth.token) {
        this._token = serverConfig.auth.token;
        logger.info('GitHub token loaded successfully');
      } else {
        logger.warn('No GitHub token found in MCP server configuration');
      }
    } catch (error) {
      logger.error('Failed to load GitHub token:', error);
    }
  }

  /**
   * Check if the client is authenticated
   */
  isAuthenticated(): boolean {
    return !!this._token;
  }

  /**
   * Check if the GitHub connection is working by making a test request
   * @returns True if the connection is working, false otherwise
   */
  async isConnectionWorking(): Promise<boolean> {
    if (!this._token) {
      return false;
    }

    try {
      // Create an abort controller with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `token ${this._token}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      return response.ok;
    } catch (error) {
      logger.error('GitHub connection test failed:', error);
      return false;
    }
  }

  /**
   * Get connection status information
   * @returns Object with connection status details
   */
  async getConnectionStatus(): Promise<{
    isAuthenticated: boolean;
    isConnected: boolean;
    user: any | null;
    error?: string;
  }> {
    const isAuthenticated = this.isAuthenticated();

    if (!isAuthenticated) {
      return {
        isAuthenticated: false,
        isConnected: false,
        user: null,
        error: 'GitHub token not available. Please configure the GitHub MCP server with a valid token.',
      };
    }

    try {
      const user = await this.getUser();
      return {
        isAuthenticated: true,
        isConnected: true,
        user,
      };
    } catch (error) {
      logger.error('Failed to get GitHub user:', error);
      return {
        isAuthenticated: true,
        isConnected: false,
        user: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Make a request to the GitHub API
   * @param endpoint The API endpoint (e.g., '/user/repos')
   * @param options Fetch options
   * @returns The response data
   */
  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this._token) {
      throw new Error('GitHub token not available. Please configure the GitHub MCP server with a valid token.');
    }

    const url = endpoint.startsWith('http') ? endpoint : `${this._baseUrl}${endpoint}`;
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
        logger.error(`Request attempt ${attempt}/${maxRetries} failed:`, error);

        // If this is not the last attempt, wait before retrying
        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s, etc.
          const backoffTime = Math.pow(2, attempt - 1) * 1000;
          logger.info(`Retrying in ${backoffTime}ms...`);
          await new Promise((resolve) => setTimeout(resolve, backoffTime));
        }
      }
    }

    // If we've exhausted all retries, throw the last error
    throw new Error(`Failed after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Get the authenticated user's information
   * @returns User information
   */
  async getUser() {
    return this.request<any>('/user');
  }

  /**
   * List repositories for the authenticated user
   * @returns List of repositories
   */
  async listRepositories() {
    return this.request<any[]>('/user/repos');
  }

  /**
   * Search repositories
   * @param query Search query
   * @returns Search results
   */
  async searchRepositories(query: string) {
    return this.request<any>(`/search/repositories?q=${encodeURIComponent(query)}`);
  }

  /**
   * Get repository contents
   * @param owner Repository owner
   * @param repo Repository name
   * @param path File path
   * @returns File contents
   */
  async getRepositoryContents(owner: string, repo: string, path: string = '') {
    return this.request<any>(`/repos/${owner}/${repo}/contents/${path}`);
  }

  /**
   * Create a new repository
   * @param name Repository name
   * @param options Repository options
   * @returns Created repository
   */
  async createRepository(name: string, options: any = {}) {
    return this.request<any>('/user/repos', {
      method: 'POST',
      body: JSON.stringify({
        name,
        private: false,
        ...options,
      }),
    });
  }
}

/**
 * Get a GitHub MCP client instance
 * @param serverName The name of the GitHub MCP server
 * @returns GitHub MCP client
 */
export function getGitHubMCPClient(serverName: string = 'github'): GitHubMCPClient {
  return new GitHubMCPClient(serverName);
}
