import { useState, useEffect } from 'react';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Card } from '~/components/ui/Card';
import { Switch } from '~/components/ui/Switch';
import { Badge } from '~/components/ui/Badge';
import { Tooltip } from '~/components/ui/Tooltip';
import { createScopedLogger } from '~/utils/logger';
import { useMCPServers } from '~/lib/hooks';
import GithubGuide from './GithubGuide';
import ServerDiscoveryDialog from './ServerDiscoveryDialog';
import ServerConfigForm from './ServerConfigForm';

const logger = createScopedLogger('MCPServersTab');

const MCPServersTab = () => {
  const {
    servers,
    loading,
    error,
    discoveringServers,
    discoveredServers,
    fetchServers,
    addServer,
    updateServer,
    setServerEnabled,
    removeServer,
    refreshAllServers,
    refreshServer,
    discoverServers,
    autoDiscoverAndAddServers,
  } = useMCPServers();

  const [newServerFormOpen, setNewServerFormOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<string | null>(null);
  const [showDiscoveryDialog, setShowDiscoveryDialog] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [refreshingServers, setRefreshingServers] = useState(false);
  const [showGitHubGuide, setShowGitHubGuide] = useState(false);

  // Calculate connection statistics
  const connectedCount = servers.filter((server) => server.connected).length;
  const enabledCount = servers.filter((server) => server.enabled).length;
  const totalToolCount = servers.reduce((acc, server) => acc + server.toolCount, 0);

  // Check if GitHub server is configured and enabled
  useEffect(() => {
    const hasGitHubServer = servers.some(
      (server) => server.name.toLowerCase() === 'github' && server.enabled && server.connected,
    );
    setShowGitHubGuide(hasGitHubServer);
  }, [servers]);

  // Function to handle server refresh
  const handleRefreshServers = async () => {
    try {
      setRefreshingServers(true);
      await refreshAllServers();
      setStatusMessage('Server status refreshed successfully');
    } catch (error) {
      setStatusMessage(`Failed to refresh server status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setRefreshingServers(false);
    }
  };

  // Function to handle opening server discovery dialog
  const handleDiscoverServers = async () => {
    try {
      await discoverServers();
      setShowDiscoveryDialog(true);
    } catch (error) {
      setStatusMessage(`Failed to discover servers: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Function to handle auto-discovery
  const handleAutoDiscover = async () => {
    try {
      setStatusMessage('Auto-discovering MCP servers...');

      const result = await autoDiscoverAndAddServers();

      if (result.addedCount > 0) {
        setStatusMessage(`Auto-discovered and added ${result.addedCount} MCP servers`);
      } else {
        setStatusMessage('No new MCP servers discovered');
      }
    } catch (error) {
      setStatusMessage(`Failed to auto-discover servers: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Function to format date as relative time
  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return 'just now';
    }

    if (diffInSeconds < 3600) {
      return `${Math.floor(diffInSeconds / 60)}m ago`;
    }

    if (diffInSeconds < 86400) {
      return `${Math.floor(diffInSeconds / 3600)}h ago`;
    }

    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  // Render server status badge
  const renderStatusBadge = (server: any) => {
    if (!server.enabled) {
      return <Badge variant="outline">Disabled</Badge>;
    }

    if (server.connected) {
      return <Badge variant="success">Connected</Badge>;
    }

    return <Badge variant="destructive">Disconnected</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header with statistics */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">MCP Servers</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Configure and manage your Model Context Protocol servers
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleRefreshServers} disabled={refreshingServers}>
            {refreshingServers ? (
              <div className="i-ph:spinner-gap-bold w-4 h-4 animate-spin mr-2" />
            ) : (
              <div className="i-ph:arrows-clockwise w-4 h-4 mr-2" />
            )}
            Refresh
          </Button>

          <Button variant="outline" size="sm" onClick={handleDiscoverServers} disabled={discoveringServers}>
            <div className="i-ph:magnifying-glass w-4 h-4 mr-2" />
            Discover
          </Button>

          <Button variant="primary" size="sm" onClick={() => setNewServerFormOpen(true)}>
            <div className="i-ph:plus-bold w-4 h-4 mr-2" />
            Add Server
          </Button>
        </div>
      </div>

      {/* Status message */}
      {statusMessage && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 p-3 rounded-md flex items-start">
          <div className="i-ph:info-bold flex-shrink-0 w-5 h-5 mr-2 mt-0.5" />
          <div>{statusMessage}</div>
        </div>
      )}

      {/* Statistics cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Servers</div>
          <div className="text-2xl font-bold">{servers.length}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {enabledCount} enabled / {servers.length - enabledCount} disabled
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Connected</div>
          <div className="text-2xl font-bold">{connectedCount}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {connectedCount} of {enabledCount} enabled servers
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Available Tools</div>
          <div className="text-2xl font-bold">{totalToolCount}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">Across all connected servers</div>
        </Card>

        <Card className="p-4">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Actions</div>
          <Button variant="outline" size="sm" className="w-full mb-2" onClick={handleAutoDiscover}>
            <div className="i-ph:lightning-bold w-4 h-4 mr-2" />
            Auto-Discover
          </Button>
          <div className="text-xs text-gray-400 dark:text-gray-500">Find and add local MCP servers</div>
        </Card>
      </div>

      {/* Server list */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Configured Servers</h3>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-32">
            <div className="flex flex-col items-center gap-2">
              <div className="i-ph:spinner-gap-bold w-8 h-8 animate-spin text-purple-500" />
              <div className="text-sm text-gray-500 dark:text-gray-400">Loading servers...</div>
            </div>
          </div>
        ) : servers.length === 0 ? (
          <Card className="p-6 border-dashed border-2 border-gray-300 dark:border-gray-700">
            <div className="text-center py-6 text-gray-500 dark:text-gray-400">
              <div className="i-ph:plug-bold w-12 h-12 mx-auto mb-4 text-gray-400 dark:text-gray-600" />
              <p className="text-lg font-medium mb-2">No MCP servers configured</p>
              <p className="mb-6">Add a server to get started with Model Context Protocol tools.</p>
              <div className="flex flex-col sm:flex-row justify-center gap-3">
                <Button onClick={() => setNewServerFormOpen(true)} variant="primary">
                  <div className="i-ph:plus-bold w-4 h-4 mr-2" />
                  Add Server Manually
                </Button>
                <Button onClick={handleAutoDiscover} variant="outline">
                  <div className="i-ph:lightning-bold w-4 h-4 mr-2" />
                  Auto-Discover Servers
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {servers.map((server) => (
              <Card key={server.id} className={`p-4 ${!server.enabled ? 'opacity-75' : ''}`}>
                <div className="flex flex-col h-full">
                  {/* Header with name and status */}
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={server.enabled}
                        onCheckedChange={(checked) => {
                          setServerEnabled(server.id, checked).catch((error) => {
                            setStatusMessage(`Failed to ${checked ? 'enable' : 'disable'} server: ${error.message}`);
                          });
                        }}
                      />
                      <h4 className="font-medium text-gray-900 dark:text-white">{server.name}</h4>
                      {renderStatusBadge(server)}
                    </div>

                    <div className="flex gap-1">
                      <Tooltip content="Edit server">
                        <Button variant="ghost" size="sm" onClick={() => setEditingServer(server.id)}>
                          <div className="i-ph:pencil-simple w-4 h-4" />
                        </Button>
                      </Tooltip>

                      <Tooltip content="Refresh status">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            refreshServer(server.id).catch((error) => {
                              setStatusMessage(`Failed to refresh server: ${error.message}`);
                            });
                          }}
                        >
                          <div className="i-ph:arrows-clockwise w-4 h-4" />
                        </Button>
                      </Tooltip>

                      <Tooltip content="Remove server">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          onClick={() => {
                            if (confirm(`Are you sure you want to remove the server "${server.name}"?`)) {
                              removeServer(server.id).catch((error) => {
                                setStatusMessage(`Failed to remove server: ${error.message}`);
                              });
                            }
                          }}
                        >
                          <div className="i-ph:trash-bold w-4 h-4" />
                        </Button>
                      </Tooltip>
                    </div>
                  </div>

                  {/* Server details */}
                  <div className="flex-grow space-y-2 mb-3">
                    <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                      <div className="i-ph:globe w-4 h-4 mr-2" />
                      <span className="truncate" title={server.baseUrl}>
                        {server.baseUrl}
                      </span>
                    </div>

                    <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                      <div className="i-ph:wrench w-4 h-4 mr-2" />
                      <span>{server.toolCount} tools available</span>
                    </div>

                    <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                      <div className="i-ph:clock w-4 h-4 mr-2" />
                      <span>Last checked: {formatRelativeTime(server.lastChecked)}</span>
                    </div>
                  </div>

                  {/* Status message */}
                  {server.statusMessage && (
                    <div
                      className={`text-xs p-2 rounded-md ${
                        server.connected
                          ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                          : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                      }`}
                    >
                      {server.statusMessage}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Quick Start Guide */}
      <div className="mt-8 p-6 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">About Model Context Protocol</h3>

        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            Model Context Protocol (MCP) allows AI models to interact with external tools and services through a
            standardized interface. When you connect an MCP server, its tools become available to the AI models in your
            application.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div className="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm">
              <div className="flex items-center mb-2">
                <div className="i-ph:plus-circle w-5 h-5 text-blue-500 mr-2" />
                <h4 className="font-medium">Add Servers</h4>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Connect to local or remote MCP servers manually or use auto-discovery to find servers on your network.
              </p>
            </div>

            <div className="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm">
              <div className="flex items-center mb-2">
                <div className="i-ph:wrench w-5 h-5 text-purple-500 mr-2" />
                <h4 className="font-medium">Use Tools</h4>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Once connected, the LLM can use tools provided by the MCP server to access external data and services.
              </p>
            </div>

            <div className="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm">
              <div className="flex items-center mb-2">
                <div className="i-ph:code w-5 h-5 text-green-500 mr-2" />
                <h4 className="font-medium">Extend Capabilities</h4>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Create your own MCP servers to add custom tools and integrate with your specific services and APIs.
              </p>
            </div>
          </div>

          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded border-l-4 border-blue-400 dark:border-blue-600">
            <div className="flex">
              <div className="flex-shrink-0">
                <div className="i-ph:info-bold w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="ml-3">
                <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200">Learn More</h4>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Visit the{' '}
                  <a
                    href="https://github.com/microsoft/modelcontextprotocol"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Model Context Protocol GitHub repository
                  </a>{' '}
                  to learn more about MCP and how to create your own MCP servers.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Show GitHub MCP Guide if GitHub server is configured */}
      {showGitHubGuide && <GithubGuide />}

      {/* Server discovery dialog */}
      {showDiscoveryDialog && (
        <ServerDiscoveryDialog
          discoveredServers={discoveredServers}
          isDiscovering={discoveringServers}
          onClose={() => setShowDiscoveryDialog(false)}
          onDiscover={() => discoverServers()}
          onAddServer={(server) => {
            addServer({
              name: server.name,
              baseUrl: server.url,
            })
              .then(() => {
                setStatusMessage(`Server "${server.name}" added successfully.`);
              })
              .catch((error) => {
                setStatusMessage(`Failed to add server: ${error.message}`);
              });
          }}
        />
      )}

      {/* New server form */}
      {newServerFormOpen && (
        <ServerConfigForm
          onClose={() => setNewServerFormOpen(false)}
          onSubmit={(data) => {
            addServer(data)
              .then(() => {
                setStatusMessage(`Server "${data.name}" added successfully.`);
                setNewServerFormOpen(false);
              })
              .catch((error) => {
                setStatusMessage(`Failed to add server: ${error.message}`);
              });
          }}
        />
      )}

      {/* Edit server form */}
      {editingServer && (
        <ServerConfigForm
          serverId={editingServer}
          initialValues={servers.find((s) => s.id === editingServer)}
          isEditing={true}
          onClose={() => setEditingServer(null)}
          onSubmit={(data) => {
            updateServer({
              serverId: editingServer,
              ...data,
            })
              .then(() => {
                setStatusMessage(`Server "${data.name}" updated successfully.`);
                setEditingServer(null);
              })
              .catch((error) => {
                setStatusMessage(`Failed to update server: ${error.message}`);
              });
          }}
        />
      )}
    </div>
  );
};

export default MCPServersTab;
