const http = require('http');
const { EventSource } = require('eventsource');

// Function to generate a random ID
function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

// Function to send a message to the SSE endpoint
function sendMessage(url, message) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/sse',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve(data);
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(JSON.stringify(message));
    req.end();
  });
}

// Main function
async function main() {
  try {
    console.log('Starting MCP debug client...');

    // Connect to the SSE endpoint
    const url = 'http://localhost:3001/sse';
    const eventSource = new EventSource(url);

    // Listen for SSE events
    eventSource.onopen = () => {
      console.log('Connected to SSE endpoint');
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      eventSource.close();
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Received SSE message:', data);
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };

    // Wait for connection to establish
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Send a list_tools request
    console.log('\nSending list_tools request...');
    const listToolsId = generateId();
    const listToolsMessage = {
      id: listToolsId,
      type: 'list_tools',
    };

    // Use HTTP POST to send the message
    await sendMessage(url, listToolsMessage);
    console.log('list_tools request sent with ID:', listToolsId);

    // Wait for response
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Send a call_tool request for the hello tool
    console.log('\nSending call_tool request for hello tool...');
    const callToolId = generateId();
    const callToolMessage = {
      id: callToolId,
      type: 'call_tool',
      tool: {
        name: 'hello',
        arguments: {
          name: 'World',
        },
      },
    };

    // Use HTTP POST to send the message
    await sendMessage(url, callToolMessage);
    console.log('call_tool request sent with ID:', callToolId);

    // Wait for response and keep connection open
    console.log('\nWaiting for responses... (Press Ctrl+C to exit)');
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
