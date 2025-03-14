/**
 * Environment variables module for MCP
 * Provides a consistent way to access environment variables in both browser and server environments
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('MCPEnv');

// Declare window.ENV for TypeScript
declare global {
  interface Window {
    ENV?: Record<string, string | undefined>;
  }
}

/**
 * Get environment variables
 * In the browser, this will return window.ENV or an empty object
 * @returns Environment variables
 */
export function getEnvironmentVariables(): Record<string, string | undefined> {
  if (typeof window !== 'undefined') {
    // Browser environment
    return window.ENV || {};
  } else {
    // Server environment
    return process.env || {};
  }
}

/**
 * Initialize window.ENV if it doesn't exist
 * This should be called as early as possible in the application lifecycle
 */
export function initializeWindowEnv(): void {
  if (typeof window !== 'undefined' && !window.ENV) {
    window.ENV = {};
    logger.debug('Initialized window.ENV');
  }
}

// Auto-initialize window.ENV when this module is imported
if (typeof window !== 'undefined') {
  initializeWindowEnv();
}
