const { client, clientSse } = require('./mcp-sdk-wrapper');
const { Client } = client;
const { SSEClientTransport } = clientSse;

async function main() {
  try {
    console.log('Starting MCP test client...');

    // Create SSE transport
    const url = new URL('http://localhost:3001/sse');
    const transport = new SSEClientTransport(url);

    // Create MCP client
    const client = new Client({
      name: 'test-client',
      version: '1.0.0',
    });

    console.log('Connecting to MCP server...');
    await client.connect(transport);
    console.log('Connected to MCP server!');

    // List available tools
    console.log('Listing available tools...');

    const toolList = await client.listTools();
    console.log(
      'Available tools:',
      toolList.tools.map((tool) => tool.name),
    );

    // Test the hello tool
    console.log('\nTesting hello tool...');

    const helloResult = await client.callTool({
      name: 'hello',
      arguments: { name: 'World' },
    });
    console.log('Hello tool result:', helloResult);

    // Test the calculator tool
    console.log('\nTesting calculator tool...');

    const calculatorResult = await client.callTool({
      name: 'calculator',
      arguments: { operation: 'add', a: 5, b: 3 },
    });
    console.log('Calculator tool result:', calculatorResult);

    // Test the weather tool
    console.log('\nTesting weather tool...');

    const weatherResult = await client.callTool({
      name: 'weather',
      arguments: { location: 'New York' },
    });
    console.log('Weather tool result:', weatherResult);

    console.log('\nAll tests completed successfully!');
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
