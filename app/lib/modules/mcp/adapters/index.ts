/**
 * MCP Server Adapters
 * Exports all available MCP server adapter implementations
 */

export { BaseMCPServerAdapter } from './base-adapter';
export { StandardMCPServerAdapter } from './standard-adapter';
export { GitHubMCPServerAdapter } from './github-adapter';

import { BaseMCPServerAdapter } from './base-adapter';
import { StandardMCPServerAdapter } from './standard-adapter';
import { GitHubMCPServerAdapter } from './github-adapter';
import type { MCPServerConfig } from '~/lib/modules/mcp/config';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('MCPAdapters');

/**
 * Factory function to create the appropriate adapter for a server configuration
 * @param id Server ID
 * @param name Server name
 * @param baseUrl Server URL
 * @param enabled Whether the server is enabled
 * @param config Additional configuration
 * @returns The appropriate adapter instance
 */
export function createServerAdapter(
  id: string,
  name: string,
  baseUrl: string,
  enabled: boolean = true,
  config: Partial<MCPServerConfig> = {},
): BaseMCPServerAdapter {
  // Check if this is a GitHub server
  if (id.toLowerCase() === 'github' || name.toLowerCase() === 'github' || config.auth?.type === 'github') {
    logger.info(`Creating GitHub adapter for server: ${name}`);
    return new GitHubMCPServerAdapter(id, name, baseUrl, enabled, config);
  }

  // Default to standard adapter
  logger.info(`Creating standard adapter for server: ${name}`);

  return new StandardMCPServerAdapter(id, name, baseUrl, enabled, config);
}
