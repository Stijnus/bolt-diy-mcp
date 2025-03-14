// This is a wrapper module to handle the ESM to CommonJS conversion for the MCP SDK
const path = require('path');

// Client exports
const clientPath = path.join(__dirname, 'node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js');
const clientSsePath = path.join(__dirname, 'node_modules/@modelcontextprotocol/sdk/dist/cjs/client/sse.js');

// Server exports
const serverPath = path.join(__dirname, 'node_modules/@modelcontextprotocol/sdk/dist/cjs/server/index.js');
const serverSsePath = path.join(__dirname, 'node_modules/@modelcontextprotocol/sdk/dist/cjs/server/sse.js');

// Export the modules
module.exports = {
  client: require(clientPath),
  clientSse: require(clientSsePath),
  server: require(serverPath),
  serverSse: require(serverSsePath),
};
