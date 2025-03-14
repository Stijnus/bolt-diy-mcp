/*
 * setup-mcp-browser.js
 * Copy and paste this entire script into your browser console while on your application
 */

(function () {
  // MCP Server Configuration
  const MCP_SERVERS = [
    {
      name: 'test',
      baseUrl: 'http://localhost:3001/sse',
      enabled: true,
    },
    {
      name: 'github',
      baseUrl: 'https://api.github.com',
      enabled: true,
      auth: {
        // This will be populated from the environment or manually
        token: '',
        type: 'github',
      },
    },
  ];

  // Try to get GitHub token from window object if available
  if (window && window.VITE_GITHUB_ACCESS_TOKEN) {
    MCP_SERVERS[1].auth.token = window.VITE_GITHUB_ACCESS_TOKEN;
    console.log('✅ Found GitHub token in window.VITE_GITHUB_ACCESS_TOKEN');
  } else {
    // Prompt for GitHub token if not found
    const githubToken = prompt('Enter your GitHub token (or leave empty to skip GitHub integration):');

    if (githubToken) {
      MCP_SERVERS[1].auth.token = githubToken;
      console.log('✅ Using manually entered GitHub token');
    } else {
      console.log('⚠️ No GitHub token provided, GitHub integration will be limited');
    }
  }

  // Save to localStorage
  localStorage.setItem('mcp_servers', JSON.stringify(MCP_SERVERS));

  console.log('✅ MCP servers configured successfully in localStorage');
  console.log('Configured servers:');
  console.table(MCP_SERVERS);

  console.log('\n🔍 Next steps:');
  console.log('1. Make sure the MCP test server is running:');
  console.log('   cd mcp-test-server && npm run simple-server');
  console.log('2. Refresh your application to load the MCP configurations');
  console.log('3. Go to Settings > MCP Servers to verify the configuration');

  // Return true to indicate success
  return true;
})();
