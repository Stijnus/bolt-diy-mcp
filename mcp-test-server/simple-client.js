const http = require('http');

async function makeRequest(endpoint, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: endpoint,
      method: data ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          // Only try to parse JSON if the content type is JSON
          const contentType = res.headers['content-type'];

          if (contentType && contentType.includes('application/json')) {
            const parsedData = JSON.parse(responseData);
            resolve(parsedData);
          } else {
            // If not JSON, just return the raw response
            resolve({ raw: responseData.substring(0, 100) + '...' });
          }
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function main() {
  try {
    console.log('Starting simple MCP test client...');

    // Check server status
    console.log('Checking server status...');

    const status = await makeRequest('/');
    console.log('Server status:', status);

    // Test the hello tool directly
    console.log('\nTesting hello tool...');

    const helloResult = await makeRequest('/call-tool', {
      name: 'hello',
      arguments: { name: 'World' },
    });
    console.log('Hello tool result:', helloResult);

    // Test the calculator tool
    console.log('\nTesting calculator tool...');

    const calculatorResult = await makeRequest('/call-tool', {
      name: 'calculator',
      arguments: { operation: 'add', a: 5, b: 3 },
    });
    console.log('Calculator tool result:', calculatorResult);

    // Test the weather tool
    console.log('\nTesting weather tool...');

    const weatherResult = await makeRequest('/call-tool', {
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
