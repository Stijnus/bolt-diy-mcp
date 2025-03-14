// check-mcp.js
// This script checks if the MCP integration is working
// Copy and paste this into your browser console

(function () {
  console.log('🔍 Checking MCP integration...');

  // Check if MCP servers are configured in localStorage
  const storedServersJson = localStorage.getItem('mcp_servers');

  if (!storedServersJson) {
    console.error('❌ No MCP servers configured in localStorage');
    console.log('Please run the setup script first');
    return false;
  }

  // Parse stored servers
  try {
    const storedServers = JSON.parse(storedServersJson);

    if (!Array.isArray(storedServers) || storedServers.length === 0) {
      console.error('❌ Invalid MCP server configuration in localStorage');
      return false;
    }

    console.log('✅ Found MCP servers in localStorage:', storedServers);

    // Check if the test server is running
    console.log('🔍 Checking if the test server is running...');

    fetch('http://localhost:3001/')
      .then((response) => {
        if (response.ok) {
          console.log('✅ Test server is running at http://localhost:3001');

          // Check SSE endpoint
          console.log('🔍 Checking SSE endpoint...');

          // We can't directly test SSE with fetch, so we'll just check if the endpoint exists
          fetch('http://localhost:3001/sse')
            .then(() => {
              console.log('✅ SSE endpoint is available');
              console.log('✅ MCP integration should be working!');
            })
            .catch((error) => {
              console.error('❌ SSE endpoint is not available:', error);
            });
        } else {
          console.error('❌ Test server is not running at http://localhost:3001');
          console.log('Please start the test server with: cd mcp-test-server && npm run simple-server');
        }
      })
      .catch((error) => {
        console.error('❌ Failed to connect to test server:', error);
        console.log('Please start the test server with: cd mcp-test-server && npm run simple-server');
      });

    // Check GitHub token
    const githubServer = storedServers.find((server) => server.name.toLowerCase() === 'github');

    if (githubServer && githubServer.auth && githubServer.auth.token) {
      console.log('✅ GitHub token is configured');

      // Check if the token is valid by making a request to the GitHub API
      fetch('https://api.github.com/user', {
        headers: {
          Authorization: `token ${githubServer.auth.token}`,
        },
      })
        .then((response) => {
          if (response.ok) {
            return response.json();
          } else {
            throw new Error(`GitHub API returned ${response.status}`);
          }
        })
        .then((user) => {
          console.log(`✅ GitHub token is valid. Authenticated as: ${user.login}`);
        })
        .catch((error) => {
          console.error('❌ GitHub token is invalid:', error);
        });
    } else {
      console.warn('⚠️ GitHub token is not configured');
    }

    return true;
  } catch (error) {
    console.error('❌ Failed to parse MCP server configuration:', error);
    return false;
  }
})();
