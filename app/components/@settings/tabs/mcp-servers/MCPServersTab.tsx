import { useState, useEffect } from 'react';
import { Button } from '~/components/ui/Button';
import { Card } from '~/components/ui/Card';
import { Switch } from '~/components/ui/Switch';
import { Badge } from '~/components/ui/Badge';
import Tooltip from '~/components/ui/Tooltip';
import { useMCPServers } from '~/lib/hooks';
import GithubGuide from './GithubGuide';
import ServerDiscoveryDialog from './ServerDiscoveryDialog';
import ServerConfigForm from './ServerConfigForm';
import { toast } from 'react-toastify';

const McpServersTab = () => {
  const {
    servers,
    loading,
    discoveringServers,
    discoveredServers,
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
  const [statusType, setStatusType] = useState<'info' | 'success' | 'error' | 'warning'>('info');

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

  // Show status message as toast and in the UI
  const showStatus = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    setStatusMessage(message);
    setStatusType(type);

    // Also show as toast for better visibility
    switch (type) {
      case 'success':
        toast.success(message);
        break;
      case 'error':
        toast.error(message);
        break;
      case 'warning':
        toast.warning(message);
        break;
      default:
        toast.info(message);
    }

    // Auto-clear status after 5 seconds
    setTimeout(() => {
      setStatusMessage('');
    }, 5000);
  };

  // Function to handle server refresh
  const handleRefreshServers = async () => {
    try {
      setRefreshingServers(true);
      await refreshAllServers();
      showStatus('Server status refreshed successfully', 'success');
    } catch (error) {
      showStatus(
        `Failed to refresh server status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    } finally {
      setRefreshingServers(false);
    }
  };

  // Function to handle opening server discovery dialog
  const handleDiscoverServers = async () => {
    try {
      showStatus('Discovering MCP servers...', 'info');
      await discoverServers();
      setShowDiscoveryDialog(true);
    } catch (error) {
      showStatus(`Failed to discover servers: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  };

  // Function to handle auto-discovery
  const handleAutoDiscover = async () => {
    try {
      showStatus('Auto-discovering MCP servers...', 'info');

      const result = await autoDiscoverAndAddServers();

      if (result.addedCount > 0) {
        showStatus(`Auto-discovered and added ${result.addedCount} MCP servers`, 'success');
      } else {
        showStatus('No new MCP servers discovered', 'info');
      }
    } catch (error) {
      showStatus(
        `Failed to auto-discover servers: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
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
    if (server.connected) {
      return (
        <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
          Connected
        </Badge>
      );
    } else if (server.enabled) {
      return (
        <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
          Disconnected
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline" className="bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300">
          Disabled
        </Badge>
      );
    }
  };

  // Function to get server type icon and color
  const getServerTypeInfo = (serverName: string) => {
    const name = serverName.toLowerCase();

    if (name.includes('github')) {
      return {
        icon: 'i-ph:github-logo',
        color: 'text-gray-800 dark:text-white',
        label: 'GitHub',
      };
    } else if (name.includes('filesystem') || name.includes('file')) {
      return {
        icon: 'i-ph:folder-open',
        color: 'text-blue-500',
        label: 'Filesystem',
      };
    } else if (name.includes('git')) {
      return {
        icon: 'i-ph:git-branch',
        color: 'text-orange-500',
        label: 'Git',
      };
    }

    return {
      icon: 'i-ph:plug',
      color: 'text-purple-500',
      label: 'Custom',
    };
  };

  // Function to render quick setup cards
  const renderQuickSetupCards = () => {
    const hasGitHub = servers.some((s) => s.name.toLowerCase().includes('github'));
    const hasFilesystem = servers.some((s) => s.name.toLowerCase().includes('filesystem'));

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {!hasGitHub && (
          <Card className="p-4 hover:shadow-md transition-shadow border-dashed border-2">
            <div className="flex items-center mb-3">
              <div className="i-ph:github-logo w-6 h-6 text-gray-800 dark:text-white mr-2" />
              <h4 className="font-medium">GitHub MCP</h4>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Connect to GitHub repositories, manage issues, and access code through AI.
            </p>
            <Button variant="outline" size="sm" className="w-full" onClick={() => setNewServerFormOpen(true)}>
              <div className="i-ph:plus-bold w-4 h-4 mr-2" />
              Add GitHub Server
            </Button>
          </Card>
        )}

        {!hasFilesystem && (
          <Card className="p-4 hover:shadow-md transition-shadow border-dashed border-2">
            <div className="flex items-center mb-3">
              <div className="i-ph:folder-open w-6 h-6 text-blue-500 mr-2" />
              <h4 className="font-medium">Filesystem MCP</h4>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Access and manage local files and directories through AI commands.
            </p>
            <Button variant="outline" size="sm" className="w-full" onClick={() => setNewServerFormOpen(true)}>
              <div className="i-ph:plus-bold w-4 h-4 mr-2" />
              Add Filesystem Server
            </Button>
          </Card>
        )}
      </div>
    );
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

          <Button variant="default" size="sm" onClick={() => setNewServerFormOpen(true)}>
            <div className="i-ph:plus w-4 h-4 mr-2" />
            Add Server
          </Button>
        </div>
      </div>

      {/* Status message */}
      {statusMessage && (
        <div
          className={`border p-3 rounded-md flex items-start ${
            statusType === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
              : statusType === 'error'
                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                : statusType === 'warning'
                  ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300'
                  : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
          }`}
        >
          <div
            className={`flex-shrink-0 w-5 h-5 mr-2 mt-0.5 ${
              statusType === 'success'
                ? 'i-ph:check-circle-bold'
                : statusType === 'error'
                  ? 'i-ph:x-circle-bold'
                  : statusType === 'warning'
                    ? 'i-ph:warning-bold'
                    : 'i-ph:info-bold'
            }`}
          />
          <div>{statusMessage}</div>
        </div>
      )}

      {/* Quick Setup Section */}
      {servers.length === 0 && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Quick Setup</h3>
            <Button variant="link" size="sm" onClick={handleAutoDiscover}>
              <div className="i-ph:lightning-bold w-4 h-4 mr-2" />
              Auto-Discover Available Servers
            </Button>
          </div>
          {renderQuickSetupCards()}
        </>
      )}

      {/* Statistics cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 hover:shadow-md transition-shadow">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Servers</div>
          <div className="text-2xl font-bold">{servers.length}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {enabledCount} enabled / {servers.length - enabledCount} disabled
          </div>
        </Card>

        <Card className="p-4 hover:shadow-md transition-shadow">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Connected</div>
          <div className="text-2xl font-bold">{connectedCount}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {connectedCount} of {enabledCount} enabled servers
          </div>
        </Card>

        <Card className="p-4 hover:shadow-md transition-shadow">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Available Tools</div>
          <div className="text-2xl font-bold">{totalToolCount}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">Across all connected servers</div>
        </Card>

        <Card className="p-4 hover:shadow-md transition-shadow">
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
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            {servers.length > 0 ? 'Configured Servers' : 'Available Servers'}
          </h3>
          {servers.length > 0 && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleAutoDiscover}>
                <div className="i-ph:lightning-bold w-4 h-4 mr-2" />
                Auto-Discover
              </Button>
              <Button variant="default" size="sm" onClick={() => setNewServerFormOpen(true)}>
                <div className="i-ph:plus-bold w-4 h-4 mr-2" />
                Add Server
              </Button>
            </div>
          )}
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
                <Button onClick={() => setNewServerFormOpen(true)} variant="default">
                  <div className="i-ph:plus-bold w-4 h-4 mr-2" />
                  Add Server
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
            {servers.map((server) => {
              const typeInfo = getServerTypeInfo(server.name);
              return (
                <Card
                  key={server.id}
                  className={`p-4 ${!server.enabled ? 'opacity-75' : ''} hover:shadow-md transition-shadow`}
                >
                  <div className="flex flex-col h-full">
                    {/* Header with name and status */}
                    <div className="flex justify-between items-center mb-3">
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={server.enabled}
                          onCheckedChange={(checked) => {
                            setServerEnabled(server.id, checked).catch((error) => {
                              showStatus(
                                `Failed to ${checked ? 'enable' : 'disable'} server: ${error.message}`,
                                'error',
                              );
                            });
                          }}
                        />
                        <div className={`${typeInfo.icon} w-5 h-5 ${typeInfo.color}`} />
                        <h4 className="font-medium text-gray-900 dark:text-white">{server.name}</h4>
                        <Badge variant="outline" className="text-xs">
                          {typeInfo.label}
                        </Badge>
                        {renderStatusBadge(server)}
                      </div>

                      <div className="flex gap-1">
                        <Tooltip tooltip="Refresh server status">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => {
                              refreshServer(server.id)
                                .then(() => showStatus(`Refreshed ${server.name} server status`, 'success'))
                                .catch((error) => {
                                  showStatus(`Failed to refresh server: ${error.message}`, 'error');
                                });
                            }}
                            disabled={refreshingServers}
                          >
                            <div className="i-ph:arrows-clockwise-bold w-4 h-4" />
                          </Button>
                        </Tooltip>

                        <Tooltip tooltip="Edit server">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => {
                              setEditingServer(server.id);
                            }}
                          >
                            <div className="i-ph:pencil-simple-bold w-4 h-4" />
                          </Button>
                        </Tooltip>

                        <Tooltip tooltip="Remove server">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => {
                              if (confirm(`Are you sure you want to remove the server "${server.name}"?`)) {
                                removeServer(server.id)
                                  .then(() => showStatus(`Server "${server.name}" removed successfully`, 'success'))
                                  .catch((error) => {
                                    showStatus(`Failed to remove server: ${error.message}`, 'error');
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
                        <div className="flex items-center">
                          <div className={`w-4 h-4 mr-1 ${server.connected ? 'i-ph:check-circle' : 'i-ph:warning'}`} />
                          {server.statusMessage}
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
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
            <div className="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center mb-2">
                <div className="i-ph:plus-circle w-5 h-5 text-blue-500 mr-2" />
                <h4 className="font-medium">Add Servers</h4>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Connect to local or remote MCP servers manually or use auto-discovery to find servers on your network.
              </p>
            </div>

            <div className="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center mb-2">
                <div className="i-ph:wrench w-5 h-5 text-purple-500 mr-2" />
                <h4 className="font-medium">Use Tools</h4>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Once connected, the LLM can use tools provided by the MCP server to access external data and services.
              </p>
            </div>

            <div className="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow">
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
                    href="https://github.com/modelcontextprotocol/servers"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-blue-500 dark:hover:text-blue-200 transition-colors"
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
          isOpen={showDiscoveryDialog}
          discoveredServers={discoveredServers}
          discovering={discoveringServers}
          onClose={() => setShowDiscoveryDialog(false)}
          onDiscover={() => discoverServers()}
          onAddServer={(server) => {
            addServer({
              name: server.name,
              baseUrl: server.url,
            })
              .then(() => {
                showStatus(`Server "${server.name}" added successfully.`, 'success');
              })
              .catch((error) => {
                showStatus(`Failed to add server: ${error.message}`, 'error');
              });
          }}
        />
      )}

      {/* New server form */}
      {newServerFormOpen && (
        <ServerConfigForm
          onCancel={() => setNewServerFormOpen(false)}
          onSubmit={(data) => {
            addServer(data)
              .then(() => {
                showStatus(`Server "${data.name}" added successfully.`, 'success');
                setNewServerFormOpen(false);
              })
              .catch((error) => {
                showStatus(`Failed to add server: ${error.message}`, 'error');
              });
          }}
        />
      )}

      {/* Edit server form */}
      {editingServer && (
        <ServerConfigForm
          initialValues={{
            name: servers.find((s) => s.id === editingServer)?.name,
            baseUrl: servers.find((s) => s.id === editingServer)?.baseUrl,
            enabled: servers.find((s) => s.id === editingServer)?.enabled,
            config: {
              auth: {
                token: '', // We don't show the token for security reasons, but allow updating it
              },
            },
          }}
          isEdit={true}
          onCancel={() => setEditingServer(null)}
          onSubmit={(data) => {
            updateServer({
              serverId: editingServer,
              ...data,
            })
              .then(() => {
                showStatus(`Server "${data.name}" updated successfully.`, 'success');
                setEditingServer(null);
              })
              .catch((error) => {
                showStatus(`Failed to update server: ${error.message}`, 'error');
              });
          }}
        />
      )}
    </div>
  );
};

export default McpServersTab;
