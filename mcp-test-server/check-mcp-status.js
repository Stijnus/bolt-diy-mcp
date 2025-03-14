#!/usr/bin/env node

/**
 * MCP Status Checker
 *
 * This script checks the status of the MCP test server and GitHub connection.
 * Run it with: node check-mcp-status.js
 */

// Import fetch for Node.js environments
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

async function checkMcpStatus() {
  console.log('Checking MCP status...\n');

  // Check MCP test server
  let testServerConnected = false;

  try {
    const response = await fetch('http://localhost:3001/');
    testServerConnected = response.ok;

    if (testServerConnected) {
      console.log('✅ MCP test server is running at http://localhost:3001');

      // Check available tools
      try {
        const toolsResponse = await fetch('http://localhost:3001/sse', {
          headers: {
            Accept: 'text/event-stream',
          },
        });

        if (toolsResponse.ok) {
          console.log('✅ MCP SSE endpoint is available at http://localhost:3001/sse');
        } else {
          console.log('❌ MCP SSE endpoint is not responding');
        }
      } catch (error) {
        console.log('❌ MCP SSE endpoint is not responding:', error.message);
      }
    } else {
      console.log('❌ MCP test server is not running');
    }
  } catch (error) {
    console.log('❌ MCP test server is not running:', error.message);
  }

  // Check GitHub connection
  console.log('\nChecking GitHub connection...');
  console.log('Note: To check GitHub connection properly, you need to run this from your application');
  console.log('where the GitHub token is configured in localStorage.');
  console.log('\nTo check GitHub connection from your application:');
  console.log('1. Open your application in the browser');
  console.log('2. Open the browser console (F12 or Cmd+Option+I)');
  console.log('3. Run this command:');
  console.log(`
const githubClient = await import('/app/lib/modules/mcp/github.js')
  .then(module => module.getGitHubMCPClient());

githubClient.getConnectionStatus().then(status => {
  console.log('GitHub Connection Status:', status);
  if (status.isConnected) {
    console.log('✅ GitHub connection is working!');
    console.log('User:', status.user.login);
  } else {
    console.log('❌ GitHub connection failed:', status.error);
  }
});
`);

  console.log("\nTo start the MCP test server if it's not running:");
  console.log('cd mcp-test-server && npm run simple-server');
}

checkMcpStatus().catch((error) => {
  console.error('Error checking MCP status:', error);
});
