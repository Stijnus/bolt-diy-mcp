/**
 * React hook for executing MCP tools via API calls
 * This hook handles the actual execution of MCP tools, making API requests and managing states.
 */

import { useState } from 'react';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('useMCPToolExecute');

interface MCPToolResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  execute: (args?: Record<string, any>) => Promise<void>;
}

interface MCPResponse<T> {
  result?: T;
  error?: string;
}

/**
 * React hook for executing MCP tools through the API
 * @param toolName Name of the tool to execute
 * @returns Tool execution state and function
 *
 * @example
 * ```tsx
 * const { data, error, loading, execute } = useMCPToolExecute('github_api');
 *
 * // Execute the tool with arguments
 * await execute({ method: 'getUser', args: { username: 'example' } });
 * ```
 */
export function useMCPToolExecute<T = any>(toolName: string): MCPToolResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const execute = async (args: Record<string, any> = {}) => {
    try {
      setLoading(true);
      setError(null);

      logger.info(`Executing MCP tool ${toolName} with args:`, args);

      const response = await fetch(`/api/mcp/tools/${toolName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(args),
      });

      const text = await response.text();
      logger.info(`Raw response from ${toolName}:`, text);

      let json: MCPResponse<T>;

      try {
        json = JSON.parse(text);
        logger.info(`Parsed response from ${toolName}:`, json);
      } catch (parseError) {
        throw new Error(`Invalid JSON response (${parseError}): ${text}`);
      }

      if (!response.ok || json.error) {
        throw new Error(json.error || `HTTP error ${response.status}`);
      }

      if (json.result !== undefined) {
        setData(json.result);
      } else {
        throw new Error('No result returned from tool');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`Error executing MCP tool ${toolName}:`, err);
      setError(errorMessage);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  return { data, error, loading, execute };
}
