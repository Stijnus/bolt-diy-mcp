/**
 * Hooks for working with MCP tools in components
 */

import { useState, useEffect, useCallback } from 'react';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('useMCPTools');

/**
 * Hook that processes MCP tool elements into styled components
 * @param content Content that may contain tool-result or tool-error elements
 * @returns Processed content with tool elements enhanced
 */
export function useMCPToolsProcessor(content: string): string {
  const [processedContent, setProcessedContent] = useState<string>(content);

  useEffect(() => {
    // Process the content to enhance tool elements
    const process = () => {
      try {
        // Create a temporary div to parse the HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;

        // Process tool-result elements
        const toolResults = tempDiv.querySelectorAll('tool-result');
        toolResults.forEach(element => {
          if (!element.hasAttribute('processed')) {
            // Mark as processed to avoid re-processing
            element.setAttribute('processed', 'true');

            // Format JSON content if needed
            try {
              const content = element.textContent || '';
              const parsedJSON = JSON.parse(content);
              element.textContent = JSON.stringify(parsedJSON, null, 2);
            } catch {
              // Not valid JSON or already formatted, leave as is
            }
          }
        });

        // Process tool-error elements
        const toolErrors = tempDiv.querySelectorAll('tool-error');
        toolErrors.forEach(element => {
          if (!element.hasAttribute('processed')) {
            element.setAttribute('processed', 'true');
            // No special processing needed for errors
          }
        });

        // Replace the content
        setProcessedContent(tempDiv.innerHTML);
      } catch (error) {
        logger.error('Error processing MCP tool elements:', error);
        setProcessedContent(content); // Use original content on error
      }
    };

    process();
  }, [content]);

  return processedContent;
}

/**
 * Check if the message contains references to MCP tools
 * @param message Message text to check
 * @returns True if the message mentions MCP tools
 */
export function useHasMCPToolsReferences(message: string): boolean {
  const [hasMCPReferences, setHasMCPReferences] = useState<boolean>(false);

  useEffect(() => {
    const checkForMCPReferences = () => {
      // Common MCP tool patterns
      const mcpPatterns = [
        /<tool\s+name/i,
        /<tool-result/i,
        /<tool-error/i,
        /mcp\s+(tool|server)/i,
        /model\s+context\s+protocol/i,
        /github_api/i,
        /github\s+integration/i,
      ];

      // Check if any pattern matches
      const hasMCP = mcpPatterns.some(pattern => pattern.test(message));
      setHasMCPReferences(hasMCP);
    };

    checkForMCPReferences();
  }, [message]);

  return hasMCPReferences;
}

/**
 * Extract MCP tool calls from a message
 * @param message Message text that may contain tool calls
 * @returns Array of extracted tool calls
 */
export function useExtractMCPToolCalls(message: string): {
  toolName: string;
  input: string;
  description: string;
}[] {
  const [toolCalls, setToolCalls] = useState<{ toolName: string; input: string; description: string }[]>([]);

  useEffect(() => {
    const extractToolCalls = () => {
      const TOOL_REGEX = /<tool\s+name\s*=\s*["']([^"']+)["']\s+input\s*=\s*["']([^"']*)["']\s*>([\s\S]*?)<\/tool>/g;
      const matches = Array.from(message.matchAll(TOOL_REGEX));

      const extractedCalls = matches.map(match => {
        const [, toolName, input, description] = match;
        return {
          toolName,
          input,
          description: description.trim(),
        };
      });

      setToolCalls(extractedCalls);
    };

    extractToolCalls();
  }, [message]);

  return toolCalls;
}

export default {
  useMCPToolsProcessor,
  useHasMCPToolsReferences,
  useExtractMCPToolCalls,
};