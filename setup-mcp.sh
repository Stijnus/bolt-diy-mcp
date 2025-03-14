#!/bin/bash

# Colors for better readability
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== MCP Integration Setup ===${NC}"
echo

# Check if the MCP test server is already running
if nc -z localhost 3001 2>/dev/null; then
  echo -e "${YELLOW}MCP test server is already running on port 3001${NC}"
else
  echo -e "${BLUE}Starting MCP test server...${NC}"
  echo "This will run in the background. Press Ctrl+C to stop it when you're done testing."
  
  # Start the MCP test server in the background
  cd mcp-test-server && npm run simple-server &
  
  # Store the PID
  MCP_SERVER_PID=$!
  
  # Wait for the server to start
  echo "Waiting for server to start..."
  sleep 3
  
  # Check if the server started successfully
  if nc -z localhost 3001 2>/dev/null; then
    echo -e "${GREEN}MCP test server started successfully on port 3001${NC}"
  else
    echo -e "${YELLOW}Failed to start MCP test server. Please start it manually:${NC}"
    echo "cd mcp-test-server && npm run simple-server"
    kill $MCP_SERVER_PID 2>/dev/null
  fi
fi

echo
echo -e "${GREEN}=== MCP Integration Instructions ===${NC}"
echo
echo -e "${BLUE}1. Copy the following code${NC}"
echo
echo "// MCP Server Setup"
echo "(function() {"
echo "  const MCP_SERVERS = ["
echo "    {"
echo "      name: 'test',"
echo "      baseUrl: 'http://localhost:3001/sse',"
echo "      enabled: true"
echo "    },"
echo "    {"
echo "      name: 'github',"
echo "      baseUrl: 'https://api.github.com',"
echo "      enabled: true,"
echo "      auth: {"
echo "        token: '',"
echo "        type: 'github'"
echo "      }"
echo "    }"
echo "  ];"
echo
echo "  // Try to get GitHub token"
echo "  const githubToken = prompt('Enter your GitHub token (or leave empty to skip GitHub integration):');"
echo "  if (githubToken) {"
echo "    MCP_SERVERS[1].auth.token = githubToken;"
echo "  }"
echo
echo "  // Save to localStorage"
echo "  localStorage.setItem('mcp_servers', JSON.stringify(MCP_SERVERS));"
echo "  console.log('✅ MCP servers configured successfully');"
echo "  return true;"
echo "})();"
echo
echo -e "${BLUE}2. Open your application in the browser${NC}"
echo
echo -e "${BLUE}3. Open the browser developer console (F12 or right-click > Inspect > Console)${NC}"
echo
echo -e "${BLUE}4. Paste the code into the console and press Enter${NC}"
echo
echo -e "${BLUE}5. Refresh the page to load the MCP configurations${NC}"
echo
echo -e "${BLUE}6. Go to Settings > MCP Servers to verify the configuration${NC}"
echo
echo -e "${GREEN}That's it! Your MCP integration should now be working.${NC}"
echo

# Keep the script running to maintain the background process
echo -e "${YELLOW}Press Ctrl+C to stop the MCP test server when you're done testing.${NC}"
wait $MCP_SERVER_PID 