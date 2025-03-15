import { useState } from 'react';
import { Dialog } from '~/components/ui/Dialog';
import { Button } from '~/components/ui/Button';
import { Badge } from '~/components/ui/Badge';
import { Card } from '~/components/ui/Card';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import { Switch } from '~/components/ui/Switch';
import type { DiscoveredServer } from '~/lib/hooks/useMCPServers';

// Extend the DiscoveredServer type with additional properties we need
interface EnhancedDiscoveredServer extends DiscoveredServer {
  id: string;
  description?: string;
  type?: string;
  version?: string;
  tools?: string[];
}

interface ServerDiscoveryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onDiscover: () => void;
  onAddServer: (server: DiscoveredServer) => void;
  discoveredServers: DiscoveredServer[];
  discovering: boolean;
}

const ServerDiscoveryDialog = ({
  isOpen,
  onClose,
  onDiscover,
  onAddServer,
  discoveredServers,
  discovering,
}: ServerDiscoveryDialogProps) => {
  const [filter, setFilter] = useState('');
  const [selectedServers, setSelectedServers] = useState<Record<string, boolean>>({});
  const [addingServer, setAddingServer] = useState<string | null>(null);

  // Convert DiscoveredServer to EnhancedDiscoveredServer with guaranteed ID
  const enhancedServers: EnhancedDiscoveredServer[] = discoveredServers.map((server) => ({
    ...server,
    id: server.url, // Use URL as ID if not provided
    type: server.name.toLowerCase().includes('github') ? 'github' : 'local',
  }));

  // Filter servers based on search input
  const filteredServers = enhancedServers.filter(
    (server) =>
      server.name.toLowerCase().includes(filter.toLowerCase()) ||
      server.url.toLowerCase().includes(filter.toLowerCase()) ||
      server.description?.toLowerCase().includes(filter.toLowerCase()),
  );

  // Toggle server selection
  const toggleServerSelection = (serverId: string) => {
    setSelectedServers((prev) => ({
      ...prev,
      [serverId]: !prev[serverId],
    }));
  };

  // Handle adding a server
  const handleAddServer = async (server: EnhancedDiscoveredServer) => {
    setAddingServer(server.id);

    try {
      await onAddServer(server);

      // Remove from selection after adding
      setSelectedServers((prev) => {
        const updated = { ...prev };
        delete updated[server.id];

        return updated;
      });
    } finally {
      setAddingServer(null);
    }
  };

  // Handle adding all selected servers
  const handleAddSelected = async () => {
    const selectedServerIds = Object.entries(selectedServers)
      .filter(([_, selected]) => selected)
      .map(([id]) => id);

    if (selectedServerIds.length === 0) {
      return;
    }

    // Add servers one by one
    for (const id of selectedServerIds) {
      const server = enhancedServers.find((s) => s.id === id);

      if (server) {
        await handleAddServer(server);
      }
    }
  };

  // Check if any servers are selected
  const hasSelectedServers = Object.values(selectedServers).some((selected) => selected);

  // Format server type for display
  const formatServerType = (type: string) => {
    switch (type.toLowerCase()) {
      case 'github':
        return (
          <Badge variant="outline" className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200">
            <div className="i-ph:github-logo w-3 h-3 mr-1" />
            GitHub
          </Badge>
        );
      case 'local':
        return (
          <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
            <div className="i-ph:desktop w-3 h-3 mr-1" />
            Local
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            <div className="i-ph:plug w-3 h-3 mr-1" />
            {type}
          </Badge>
        );
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <Dialog onClose={onClose}>
      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Discover MCP Servers</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Find and add Model Context Protocol servers on your network
          </p>
        </div>

        <div className="space-y-4">
          {/* Search and Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-grow">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <div className="i-ph:magnifying-glass w-4 h-4 text-gray-400" />
              </div>
              <Input
                type="text"
                placeholder="Search servers..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button onClick={onDiscover} disabled={discovering} variant="outline" className="flex-shrink-0">
              {discovering ? (
                <>
                  <div className="i-ph:spinner-gap-bold w-4 h-4 animate-spin mr-2" />
                  Scanning...
                </>
              ) : (
                <>
                  <div className="i-ph:arrows-clockwise w-4 h-4 mr-2" />
                  Refresh
                </>
              )}
            </Button>
          </div>

          {/* Server List */}
          <div className="border rounded-md overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-800 p-3 border-b flex items-center justify-between">
              <div className="flex items-center">
                <Switch
                  checked={filteredServers.length > 0 && filteredServers.every((server) => selectedServers[server.id])}
                  onCheckedChange={(checked) => {
                    // Only apply if there are servers to select
                    if (filteredServers.length > 0) {
                      const newSelection: Record<string, boolean> = {};
                      filteredServers.forEach((server) => {
                        newSelection[server.id] = checked;
                      });
                      setSelectedServers(newSelection);
                    }
                  }}
                />
                <Label className="ml-2 text-sm font-medium">
                  {filteredServers.length > 0
                    ? `Select All (${
                        Object.values(selectedServers).filter(Boolean).length
                      } of ${filteredServers.length})`
                    : 'No Servers Found'}
                </Label>
              </div>
              <Button size="sm" disabled={!hasSelectedServers} onClick={handleAddSelected} variant="default">
                <div className="i-ph:plus-bold w-4 h-4 mr-2" />
                Add Selected
              </Button>
            </div>

            <div className="max-h-[400px] overflow-y-auto">
              {discovering && filteredServers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="i-ph:spinner-gap-bold w-10 h-10 animate-spin text-purple-500 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Scanning for MCP Servers</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
                    Looking for Model Context Protocol servers on your network. This may take a moment...
                  </p>
                </div>
              ) : filteredServers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="i-ph:magnifying-glass w-10 h-10 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">No Servers Found</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
                    {filter
                      ? `No servers matching "${filter}" were found. Try a different search term or refresh.`
                      : 'No MCP servers were discovered on your network. Try refreshing or adding a server manually.'}
                  </p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={onDiscover} disabled={discovering}>
                    <div className="i-ph:arrows-clockwise w-4 h-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredServers.map((server) => (
                    <div
                      key={server.id}
                      className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                        selectedServers[server.id] ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      <div className="flex items-start">
                        <div className="flex items-center h-5 mt-1">
                          <Switch
                            checked={!!selectedServers[server.id]}
                            onCheckedChange={() => toggleServerSelection(server.id)}
                          />
                        </div>
                        <div className="ml-3 flex-grow">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-medium text-gray-900 dark:text-white">{server.name}</h3>
                              {formatServerType(server.type || 'Unknown')}
                              {server.version && (
                                <Badge variant="outline" className="text-xs">
                                  v{server.version}
                                </Badge>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleAddServer(server)}
                              disabled={addingServer === server.id}
                              className="ml-2"
                            >
                              {addingServer === server.id ? (
                                <div className="i-ph:spinner-gap-bold w-4 h-4 animate-spin" />
                              ) : (
                                <div className="i-ph:plus-bold w-4 h-4" />
                              )}
                            </Button>
                          </div>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{server.url}</p>
                          {server.description && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{server.description}</p>
                          )}
                          {server.tools && server.tools.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs text-gray-600 dark:text-gray-300 mb-1">
                                Available Tools: {server.tools.length}
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {server.tools.slice(0, 5).map((tool, index) => (
                                  <Badge key={index} variant="outline" className="text-xs bg-gray-50 dark:bg-gray-800">
                                    {tool}
                                  </Badge>
                                ))}
                                {server.tools.length > 5 && (
                                  <Badge variant="outline" className="text-xs bg-gray-50 dark:bg-gray-800">
                                    +{server.tools.length - 5} more
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Info Card */}
          <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <div className="flex">
              <div className="flex-shrink-0">
                <div className="i-ph:info-bold w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="ml-3">
                <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200">About MCP Discovery</h4>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  MCP servers are discovered using mDNS on your local network. If you don't see your server, make sure
                  it's running and properly configured for discovery.
                </p>
              </div>
            </div>
          </Card>
        </div>

        <div className="flex justify-end mt-6">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
};

export default ServerDiscoveryDialog;
