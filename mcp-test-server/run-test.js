const { spawn } = require('child_process');
const path = require('path');

// Start the server
console.log('Starting MCP server...');

const server = spawn('node', ['server.js'], {
  stdio: 'inherit',
  cwd: __dirname,
});

// Wait for the server to start
setTimeout(() => {
  // Run the test client
  console.log('\nRunning test client...');

  const client = spawn('node', ['test-client.js'], {
    stdio: 'inherit',
    cwd: __dirname,
  });

  client.on('close', (code) => {
    console.log(`\nTest client exited with code ${code}`);

    // Keep the server running for manual testing
    console.log('\nServer is still running. Press Ctrl+C to stop.');
  });
}, 2000); // Wait 2 seconds for the server to start

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.kill();
  process.exit(0);
});
