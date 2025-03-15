/**
 * MCP Tool Handler
 * Handles the execution of MCP tools by LLMs
 */

import { createScopedLogger } from '~/utils/logger';
import { getMCPBootstrapPromise } from './bootstrap';

const logger = createScopedLogger('MCPToolHandler');

/**
 * Tool call regex patterns
 */
const TOOL_PATTERNS = {
  // Pattern for tool invocation: <tool name="tool_name" input="{...}">...</tool>
  TOOL_REGEX: /<tool\s+name\s*=\s*["']([^"']+)["']\s+input\s*=\s*["']([^"']*)["']\s*>([\s\S]*?)<\/tool>/g,

  // Pattern for simplified tool format: <tool_name>...</tool_name>
  SIMPLIFIED_TOOL_REGEX: /<(\w+)>([\s\S]*?)<\/\1>/g,

  // Pattern for GitHub direct format: <github_list_repositories>...</github_list_repositories>
  GITHUB_LIST_REGEX: /<github_list_repositories>([\s\S]*?)<\/github_list_repositories>/g,

  // Pattern for JSON input: <tool name="tool_name" input='{"key": "value"}'>...</tool>
  JSON_INPUT_REGEX: /^\s*{.*}\s*$/,

  // Pattern for function-style input: <tool name="github_api" input="getUser">...</tool>
  FUNCTION_INPUT_REGEX: /^(\w+)(?:\((.*)\))?$/,

  // Mapping of simplified tool names to actual tool names
  SIMPLIFIED_TOOL_MAP: {
    github_list_repositories: 'github_api',
    github_get_user: 'github_api',
    github_search_repositories: 'github_api',
    github_get_repository_contents: 'github_api',
    github_create_repository: 'github_api',
  } as const,
};

/**
 * Result of processing a message containing tool calls
 */
interface ToolProcessingResult {
  processedText: string;
  toolCalls: ToolCall[];
}

/**
 * Information about a tool call
 */
export interface ToolCall {
  toolName: string;
  input: any;
  rawInput: string;
  description: string;
  result?: any;
  error?: string;
}

/**
 * Process a message to find and execute tool calls
 * @param message Message text potentially containing tool calls
 * @returns Processed message with tool calls replaced by their results
 */
export async function processToolCalls(message: string): Promise<ToolProcessingResult> {
  let processedText = message;
  const toolCalls: ToolCall[] = [];

  // Log the message we're about to process
  logger.info(`Processing message for tool calls: ${message.substring(0, 100)}...`);

  try {
    /*
     * Add auto-tool call for GitHub repositories if the message asks for them
     * This is a special debug case to ensure that GitHub API works
     */
    if (
      message.toLowerCase().includes('github repositories') ||
      message.toLowerCase().includes('my repositories') ||
      message.toLowerCase().includes('list repositories') ||
      message.toLowerCase().includes('show repositories')
    ) {
      if (!message.includes('<tool name="github_')) {
        logger.info('Detected GitHub repository request without tool call, adding forced tool call');
        message +=
          '\n<tool name="github_api" input="listRepositories">Auto-added tool call to fetch repositories</tool>';
      }
    }

    // Check for alternative GitHub repository list format
    const githubListMatches = Array.from(message.matchAll(TOOL_PATTERNS.GITHUB_LIST_REGEX));

    if (githubListMatches.length > 0) {
      logger.info(`Found direct GitHub list repository tags: ${githubListMatches.length}`);

      // Replace with standard format
      for (const match of githubListMatches) {
        const [fullMatch] = match;
        const replacement = `<tool name="github_api" input="listRepositories">GitHub repository list</tool>`;
        processedText = processedText.replace(fullMatch, replacement);

        // Also update the original message for later parsing
        message = message.replace(fullMatch, replacement);
      }
    }

    // Check for other simplified tool formats
    const simplifiedMatches = Array.from(message.matchAll(TOOL_PATTERNS.SIMPLIFIED_TOOL_REGEX));

    if (simplifiedMatches.length > 0) {
      logger.info(`Found simplified tool tags: ${simplifiedMatches.length}`);

      // Replace with standard format
      for (const match of simplifiedMatches) {
        const [fullMatch, toolName, innerContent] = match;

        // Only process if it's a GitHub tool
        if (toolName.startsWith('github_')) {
          const actualToolName = 'github_api';
          const input = toolName === 'github_list_repositories' ? 'listRepositories' : toolName.replace('github_', '');

          const replacement = `<tool name="${actualToolName}" input="${input}">${innerContent}</tool>`;
          processedText = processedText.replace(fullMatch, replacement);

          // Also update the original message for later parsing
          message = message.replace(fullMatch, replacement);
        }
      }
    }

    // Extract tool calls from the message (now including any reformatted ones)
    const matches = Array.from(message.matchAll(TOOL_PATTERNS.TOOL_REGEX));

    if (matches.length === 0) {
      // No tool calls found
      return { processedText, toolCalls };
    }

    // Get the required MCP components
    const { toolFactory } = await getMCPBootstrapPromise();

    // Create AI SDK tools that will handle the execution
    const tools = await toolFactory.createTools();

    // Process each tool call
    for (const match of matches) {
      const [fullMatch, toolName, rawInput, description] = match;

      try {
        // Parse the input based on its format
        const input = parseToolInput(rawInput, toolName);

        // Create a tool call object
        const toolCall: ToolCall = {
          toolName,
          input,
          rawInput,
          description: description.trim(),
        };

        // Check if the tool exists
        if (tools[toolName]) {
          try {
            // Execute the tool
            const tool = tools[toolName];

            if (!tool || !tool.execute) {
              throw new Error(`Tool not found or not executable: ${toolName}`);
            }

            const result = await tool.execute(input, {
              toolCallId: `mcp-tool-${toolName}-${Date.now()}`,
              messages: [],
            });

            // Store the result
            toolCall.result = JSON.parse(result);

            // Replace the tool call in the message with the result
            processedText = processedText.replace(
              fullMatch,
              `<tool-result name="${toolName}">
${JSON.stringify(toolCall.result, null, 2)}
</tool-result>`,
            );
          } catch (execError) {
            // Store the error
            const errorMessage = execError instanceof Error ? execError.message : String(execError);
            toolCall.error = errorMessage;

            // Replace the tool call in the message with the error
            processedText = processedText.replace(
              fullMatch,
              `<tool-error name="${toolName}">
Error: ${errorMessage}
</tool-error>`,
            );

            logger.error(`Error executing MCP tool ${toolName}:`, execError);
          }
        } else {
          // Tool not found
          toolCall.error = `Tool "${toolName}" not found`;

          // Replace the tool call in the message with the error
          processedText = processedText.replace(
            fullMatch,
            `<tool-error name="${toolName}">
Error: Tool "${toolName}" not found
</tool-error>`,
          );

          logger.warn(`MCP tool not found: ${toolName}`);
        }

        // Add the tool call to the list
        toolCalls.push(toolCall);
      } catch (parseError) {
        // Error parsing the input
        const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);

        // Replace the tool call in the message with the error
        processedText = processedText.replace(
          fullMatch,
          `<tool-error name="${toolName}">
Error parsing input: ${errorMessage}
</tool-error>`,
        );

        // Add the tool call to the list
        toolCalls.push({
          toolName,
          input: null,
          rawInput,
          description: description.trim(),
          error: `Error parsing input: ${errorMessage}`,
        });

        logger.error(`Error parsing MCP tool input for ${toolName}:`, parseError);
      }
    }
  } catch (error) {
    logger.error('Error processing MCP tool calls:', error);
  }

  return { processedText, toolCalls };
}

/**
 * Parse tool input from string
 * @param input Raw input string
 * @param toolName Tool name (for special handling)
 * @returns Parsed input object
 */
function parseToolInput(input: string, toolName: string): any {
  // Special handling for GitHub API
  if (toolName === 'github_api') {
    return parseGitHubApiInput(input);
  }

  // Try to parse as JSON
  if (TOOL_PATTERNS.JSON_INPUT_REGEX.test(input)) {
    try {
      return JSON.parse(input);
    } catch {
      // If parsing fails, continue with other methods
    }
  }

  // Try to parse as function-style input
  const functionMatch = input.match(TOOL_PATTERNS.FUNCTION_INPUT_REGEX);

  if (functionMatch) {
    const [, functionName, argsString] = functionMatch;

    if (argsString) {
      // Parse comma-separated arguments
      try {
        // Wrap in array brackets and parse as JSON
        const argsJson = `[${argsString}]`;
        const args = JSON.parse(argsJson);

        // Convert to named parameters if the tool expects them
        if (Array.isArray(args)) {
          // Default to positional parameters
          return args;
        }
      } catch {
        // If parsing fails, treat as plain string
        return argsString;
      }
    }

    // No arguments, just return the function name
    return functionName;
  }

  // For simple string inputs
  return input;
}

/**
 * Parse GitHub API tool input
 * @param input Raw input string
 * @returns Parsed input object
 */
function parseGitHubApiInput(input: string): any {
  // Match function-style input
  const functionMatch = input.match(TOOL_PATTERNS.FUNCTION_INPUT_REGEX);

  if (functionMatch) {
    const [, methodName, argsString] = functionMatch;

    logger.info(`Parsing GitHub API method call: ${methodName}(${argsString || ''})`);

    // Create input object with method name
    const result: { method: string; args?: any } = {
      method: methodName,
    };

    // Parse arguments if provided
    if (argsString) {
      try {
        // Try to parse as JSON object first if it looks like one
        if (argsString.trim().startsWith('{') && argsString.trim().endsWith('}')) {
          result.args = JSON.parse(argsString);
        } else {
          // Wrap in array brackets and parse as JSON array
          const argsJson = `[${argsString}]`;

          try {
            // Try to parse as JSON array
            result.args = JSON.parse(argsJson);
          } catch {
            // If parsing fails, split by commas and trim
            result.args = argsString.split(',').map((arg) => arg.trim());
          }
        }
      } catch (error) {
        logger.warn(`Failed to parse GitHub API args as JSON, using as string: ${argsString}`, error);

        // If all parsing fails, use the raw string
        result.args = argsString;
      }
    } else {
      // No arguments provided, use empty object
      result.args = {};
    }

    logger.info(`Parsed GitHub API input:`, result);

    return result;
  }

  // Handle simple method name without parentheses
  if (typeof input === 'string' && input.trim() && !input.includes('(')) {
    return {
      method: input.trim(),
      args: {},
    };
  }

  // If not function-style, try parsing as JSON or return as is
  try {
    return JSON.parse(input);
  } catch {
    // If it's just a simple string, it might be a method name
    return {
      method: input,
      args: {},
    };
  }
}
