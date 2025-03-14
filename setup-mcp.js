/*
 * setup-mcp.js
 * This script automatically sets up MCP servers in localStorage
 */

/**
 * MCP Server Configuration
 */
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
      token: process.env.VITE_GITHUB_ACCESS_TOKEN || '',
      type: 'github',
    },
  },
];

/**
 * Save MCP servers to localStorage
 */
function saveMCPServersToStorage() {
  try {
    // Check if running in Node.js environment
    if (typeof localStorage === 'undefined') {
      console.log('This script must be run in a browser environment');
      return false;
    }

    // Save to localStorage
    localStorage.setItem('mcp_servers', JSON.stringify(MCP_SERVERS));
    console.log('✅ MCP servers configured successfully in localStorage');
    console.log('Configured servers:');
    console.table(MCP_SERVERS);

    return true;
  } catch (error) {
    console.error('Failed to save MCP server configurations:', error);
    return false;
  }
}

// Execute the setup
saveMCPServersToStorage();

console.log('\n🔍 Next steps:');
console.log('1. Make sure the MCP test server is running:');
console.log('   cd mcp-test-server && npm run simple-server');
console.log('2. Refresh your application to load the MCP configurations');
console.log('3. Go to Settings > MCP Servers to verify the configuration');
