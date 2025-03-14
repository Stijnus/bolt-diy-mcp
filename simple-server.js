const express = require('express');
const cors = require('cors');
const path = require('path');

// Create Express app
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.text());
app.use(express.raw({ type: '*/*' }));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Define the available tools
const tools = [
  {
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
  },
  {
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
  },
  {
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
  },
];

// Set up the SSE endpoint
app.all('/sse', (req, res) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log(`SSE connection established from ${clientIp}`);
  console.log('Request headers:', JSON.stringify(req.headers, null, 2));
  console.log('Request method:', req.method);

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  console.log('Response headers set:', JSON.stringify(res._headers, null, 2));

  // Send a welcome message
  res.write('event: connected\n');
  res.write('data: {"message": "Connected to MCP test server"}\n\n');

  // Automatically send the list_tools_response after connection
  const toolsResponse = {
    id: 'auto-list-tools',
    type: 'list_tools_response',
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };

  // Send the tools list immediately
  console.log('Automatically sending tools list');
  res.write(`data: ${JSON.stringify(toolsResponse)}\n\n`);

  // Handle POST data for the SSE connection
  req.on('data', (chunk) => {
    try {
      console.log('Received data on SSE connection:', chunk.toString());

      const message = JSON.parse(chunk.toString());

      // Handle list tools request
      if (message.type === 'list_tools') {
        console.log('Handling list_tools request with ID:', message.id);

        const response = {
          id: message.id,
          type: 'list_tools_response',
          tools,
        };

        res.write(`data: ${JSON.stringify(response)}\n\n`);
      }

      // Handle call tool request
      if (message.type === 'call_tool') {
        console.log('Handling call_tool request with ID:', message.id, 'for tool:', message.tool.name);

        const { name, arguments: args } = message.tool;
        let result;

        if (name === 'hello') {
          result = { message: `Hello, ${args.name}!` };
        } else if (name === 'calculator') {
          const { operation, a, b } = args;

          switch (operation) {
            case 'add':
              result = { result: a + b };
              break;
            case 'subtract':
              result = { result: a - b };
              break;
            case 'multiply':
              result = { result: a * b };
              break;
            case 'divide':
              if (b === 0) {
                result = { error: 'Division by zero' };
              } else {
                result = { result: a / b };
              }

              break;
            default:
              result = { error: `Unknown operation: ${operation}` };
          }
        } else if (name === 'weather') {
          const locations = {
            'new york': { temperature: 72, condition: 'Sunny', humidity: 45 },
            london: { temperature: 62, condition: 'Cloudy', humidity: 80 },
            tokyo: { temperature: 85, condition: 'Rainy', humidity: 90 },
            sydney: { temperature: 70, condition: 'Clear', humidity: 50 },
          };

          const location = args.location.toLowerCase();

          if (locations[location]) {
            result = {
              location: args.location,
              ...locations[location],
            };
          } else {
            result = {
              location: args.location,
              temperature: Math.floor(Math.random() * 30) + 60,
              condition: ['Sunny', 'Cloudy', 'Rainy', 'Clear'][Math.floor(Math.random() * 4)],
              humidity: Math.floor(Math.random() * 50) + 30,
            };
          }
        } else {
          result = { error: `Tool not found: ${name}` };
        }

        const response = {
          id: message.id,
          type: 'call_tool_response',
          result,
        };

        res.write(`data: ${JSON.stringify(response)}\n\n`);
      }
    } catch (error) {
      console.error('Error processing message:', error);

      // Send error response
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    }
  });

  // Handle client disconnection
  req.on('close', () => {
    console.log('Client disconnected');
  });
});

// Add a list tools endpoint
app.post('/list-tools', (req, res) => {
  res.json({ tools });
});

// Add a call tool endpoint
app.post('/call-tool', (req, res) => {
  const { name, arguments: args } = req.body;

  if (name === 'hello') {
    res.json({ message: `Hello, ${args.name}!` });
  } else if (name === 'calculator') {
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
          return res.status(400).json({ error: 'Division by zero' });
        }

        result = a / b;
        break;
      default:
        return res.status(400).json({ error: `Unknown operation: ${operation}` });
    }

    res.json({ result });
  } else if (name === 'weather') {
    const locations = {
      'new york': { temperature: 72, condition: 'Sunny', humidity: 45 },
      london: { temperature: 62, condition: 'Cloudy', humidity: 80 },
      tokyo: { temperature: 85, condition: 'Rainy', humidity: 90 },
      sydney: { temperature: 70, condition: 'Clear', humidity: 50 },
    };

    const location = args.location.toLowerCase();

    if (locations[location]) {
      res.json({
        location: args.location,
        ...locations[location],
      });
    } else {
      res.json({
        location: args.location,
        temperature: Math.floor(Math.random() * 30) + 60,
        condition: ['Sunny', 'Cloudy', 'Rainy', 'Clear'][Math.floor(Math.random() * 4)],
        humidity: Math.floor(Math.random() * 50) + 30,
      });
    }
  } else {
    res.status(404).json({ error: `Tool not found: ${name}` });
  }
});

// Add a simple status endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    server: 'mcp-test-server',
    version: '1.0.0',
    tools: tools.map((tool) => tool.name),
  });
});

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Simple MCP Test Server running on http://localhost:${PORT}`);
  console.log(`MCP SSE endpoint available at http://localhost:${PORT}/sse`);
  console.log(`Available tools: ${tools.map((tool) => tool.name).join(', ')}`);
});
