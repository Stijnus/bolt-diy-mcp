const express = require('express');
const cors = require('cors');
const path = require('path');
const { server, serverSse } = require('./mcp-sdk-wrapper');
const { Server } = server;
const { SSEServerTransport } = serverSse;

// Create Express app
const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Create MCP server
const mcpServer = new Server({
  name: 'mcp-test-server',
  version: '1.0.0',
});

// Define some simple tools
mcpServer.defineTool({
  name: 'hello',
  description: 'Say hello to someone',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'The name of the person to greet',
      },
    },
    required: ['name'],
  },
  execute: async (args) => {
    return { message: `Hello, ${args.name}!` };
  },
});

mcpServer.defineTool({
  name: 'calculator',
  description: 'Perform basic arithmetic operations',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['add', 'subtract', 'multiply', 'divide'],
        description: 'The operation to perform',
      },
      a: {
        type: 'number',
        description: 'The first number',
      },
      b: {
        type: 'number',
        description: 'The second number',
      },
    },
    required: ['operation', 'a', 'b'],
  },
  execute: async (args) => {
    const { operation, a, b } = args;
    let result;

    switch (operation) {
      case 'add':
        result = a + b;
        break;
      case 'subtract':
        result = a - b;
        break;
      case 'multiply':
        result = a * b;
        break;
      case 'divide':
        if (b === 0) {
          throw new Error('Division by zero');
        }

        result = a / b;
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    return { result };
  },
});

mcpServer.defineTool({
  name: 'weather',
  description: 'Get the current weather for a location',
  inputSchema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'The location to get weather for',
      },
    },
    required: ['location'],
  },
  execute: async (args) => {
    // This is a mock implementation - in a real server, you would call a weather API
    const locations = {
      'new york': { temperature: 72, condition: 'Sunny', humidity: 45 },
      london: { temperature: 62, condition: 'Cloudy', humidity: 80 },
      tokyo: { temperature: 85, condition: 'Rainy', humidity: 90 },
      sydney: { temperature: 70, condition: 'Clear', humidity: 50 },
    };

    const location = args.location.toLowerCase();

    if (locations[location]) {
      return {
        location: args.location,
        ...locations[location],
      };
    } else {
      return {
        location: args.location,
        temperature: Math.floor(Math.random() * 30) + 60,
        condition: ['Sunny', 'Cloudy', 'Rainy', 'Clear'][Math.floor(Math.random() * 4)],
        humidity: Math.floor(Math.random() * 50) + 30,
      };
    }
  },
});

// Create SSE transport
const sseTransport = new SSEServerTransport();

// Set up the SSE endpoint
app.use('/sse', sseTransport.handler);

// Connect the server to the transport
mcpServer.connect(sseTransport);

// Add a simple status endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    server: mcpServer.name,
    version: mcpServer.version,
    tools: mcpServer.tools.map((tool) => tool.name),
  });
});

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`MCP Test Server running on http://localhost:${PORT}`);
  console.log(`MCP SSE endpoint available at http://localhost:${PORT}/sse`);
  console.log(`Available tools: ${mcpServer.tools.map((tool) => tool.name).join(', ')}`);
  console.log(`Web client available at http://localhost:${PORT}`);
});
