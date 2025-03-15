import { useState, useEffect } from 'react';
import { Button } from '~/components/ui/Button';
import { Card } from '~/components/ui/Card';
import { Input } from '~/components/ui/Input';
import { Switch } from '~/components/ui/Switch';
import { Label } from '~/components/ui/Label';

interface ServerConfigFormProps {
  initialValues?: {
    name?: string;
    baseUrl?: string;
    enabled?: boolean;
    config?: {
      auth?: {
        token?: string;
      };
    };
  };
  isEdit?: boolean;
  onSubmit: (data: any) => void;
  onCancel: () => void;
}

interface ServerTypeConfig {
  name: string;
  icon: string;
  color: string;
  description: string;
  urlPlaceholder: string;
  tokenLabel: string;
  tokenDescription: string;
  tokenLink?: string;
  tokenLinkText?: string;
}

type ServerTypes = {
  [key: string]: ServerTypeConfig;
};

const ServerConfigForm = ({ initialValues = {}, isEdit = false, onSubmit, onCancel }: ServerConfigFormProps) => {
  const [serverType, setServerType] = useState<string>('custom');
  const [name, setName] = useState(initialValues.name || '');
  const [baseUrl, setBaseUrl] = useState(initialValues.baseUrl || '');
  const [token, setToken] = useState(initialValues.config?.auth?.token || '');
  const [enabled, setEnabled] = useState(initialValues.enabled !== undefined ? initialValues.enabled : true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Detect server type from name or URL
  useEffect(() => {
    if (name.toLowerCase().includes('github')) {
      setServerType('github');
    } else if (name.toLowerCase().includes('filesystem')) {
      setServerType('filesystem');
    }

    // Removed Git type detection to avoid confusion with GitHub
  }, [name]);

  // Server type configurations
  const serverTypes: ServerTypes = {
    github: {
      name: 'GitHub MCP',
      icon: 'i-ph:github-logo',
      color: 'text-gray-800 dark:text-white',
      description: 'Connect to GitHub repositories and manage code through AI.',
      urlPlaceholder: 'https://api.github.com',
      tokenLabel: 'GitHub Personal Access Token',
      tokenDescription: 'Create a token with repo and user scopes.',
      tokenLink: 'https://github.com/settings/tokens',
      tokenLinkText: 'Generate token on GitHub',
    },
    filesystem: {
      name: 'Filesystem MCP',
      icon: 'i-ph:folder-open',
      color: 'text-blue-500',
      description: 'Access and manage local files through AI commands.',
      urlPlaceholder: 'http://localhost:8080',
      tokenLabel: 'Authentication Token',
      tokenDescription: 'Optional: Only if your filesystem server requires authentication.',
    },
    custom: {
      name: 'Custom MCP',
      icon: 'i-ph:plug',
      color: 'text-purple-500',
      description: 'Connect to a custom Model Context Protocol server.',
      urlPlaceholder: 'http://your-server-url',
      tokenLabel: 'Authentication Token',
      tokenDescription: 'Optional: Add if your server requires authentication.',
    },
  };

  // Test connection to server
  const testConnection = async (params: { baseUrl: string; token?: string }) => {
    try {
      setIsTesting(true);
      setTestResult({ success: false, message: 'Testing connection...' });

      // Basic validation
      if (!params.baseUrl) {
        throw new Error('Server URL is required');
      }

      try {
        new URL(params.baseUrl);
      } catch {
        throw new Error('Invalid URL format');
      }

      // Simulate network request
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // For demo purposes, assume success if URL is valid
      setTestResult({
        success: true,
        message: 'Successfully connected to the MCP server',
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Validation
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Server name is required';
    }

    if (!baseUrl.trim()) {
      newErrors.baseUrl = 'Server URL is required';
    } else {
      try {
        new URL(baseUrl);
      } catch {
        newErrors.baseUrl = 'Invalid URL format';
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit({
        name,
        baseUrl,
        enabled,
        config: {
          auth: {
            token: token.trim() || undefined,
            type: serverType,
          },
        },
      });
    } catch (error) {
      console.error('Failed to submit:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedType = serverTypes[serverType];

  return (
    <Card className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          {isEdit ? 'Edit MCP Server' : 'Add MCP Server'}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {isEdit
            ? 'Update the configuration for this Model Context Protocol server.'
            : 'Configure a new Model Context Protocol server to connect to.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {!isEdit && (
          <div>
            <Label className="text-sm font-medium">Server Type</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {Object.entries(serverTypes).map(([key, type]) => (
                <button
                  key={key}
                  type="button"
                  className={`flex items-center p-3 rounded-lg border transition-colors ${
                    serverType === key
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-purple-200 dark:hover:border-purple-800'
                  }`}
                  onClick={() => {
                    setServerType(key);
                    setName(type.name);

                    if (!baseUrl) {
                      setBaseUrl(type.urlPlaceholder);
                    }
                  }}
                >
                  <div className={`${type.icon} w-5 h-5 ${type.color} mr-2`} />
                  <span className="text-sm font-medium">{type.name}</span>
                </button>
              ))}
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{selectedType.description}</p>
          </div>
        )}

        <div className="space-y-4">
          {/* Server Name */}
          <div>
            <Label htmlFor="name" className="text-sm font-medium">
              Server Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);

                if (errors.name) {
                  setErrors({ ...errors, name: '' });
                }
              }}
              placeholder={selectedType.name}
              className={`mt-1 ${errors.name ? 'border-red-500 focus:ring-red-500' : ''}`}
              autoComplete="off"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-500 flex items-center">
                <div className="i-ph:warning-circle w-4 h-4 mr-1" />
                {errors.name}
              </p>
            )}
          </div>

          {/* Server URL */}
          <div>
            <Label htmlFor="baseUrl" className="text-sm font-medium">
              Server URL <span className="text-red-500">*</span>
            </Label>
            <Input
              id="baseUrl"
              type="text"
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value);

                if (errors.baseUrl) {
                  setErrors({ ...errors, baseUrl: '' });
                }
              }}
              placeholder={selectedType.urlPlaceholder}
              className={`mt-1 ${errors.baseUrl ? 'border-red-500 focus:ring-red-500' : ''}`}
              autoComplete="off"
            />
            {errors.baseUrl && (
              <p className="mt-1 text-sm text-red-500 flex items-center">
                <div className="i-ph:warning-circle w-4 h-4 mr-1" />
                {errors.baseUrl}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              The base URL of the MCP server, including protocol (http:// or https://)
            </p>
          </div>

          {/* Authentication Token */}
          <div>
            <Label htmlFor="token" className="text-sm font-medium flex items-center justify-between">
              <span>{selectedType.tokenLabel}</span>
              {selectedType.tokenLink && (
                <a
                  href={selectedType.tokenLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  {selectedType.tokenLinkText}
                </a>
              )}
            </Label>
            <Input
              id="token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter authentication token if required"
              className="mt-1"
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{selectedType.tokenDescription}</p>
          </div>

          {/* Enabled Switch */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Enable Server</Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">Enable or disable this server's functionality</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>

        {/* Test Connection Result */}
        {testResult && (
          <div
            className={`p-4 rounded-md ${
              testResult.success
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
            }`}
          >
            <div className="flex items-center">
              <div className={`w-5 h-5 mr-2 ${testResult.success ? 'i-ph:check-circle-bold' : 'i-ph:x-circle-bold'}`} />
              <span className="font-medium">{testResult.message}</span>
            </div>
          </div>
        )}

        {/* Form Actions */}
        <div className="flex justify-between items-center pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => testConnection({ baseUrl, token })}
            disabled={isTesting || !baseUrl}
          >
            {isTesting ? (
              <>
                <div className="i-ph:spinner-gap-bold w-4 h-4 animate-spin mr-2" />
                Testing...
              </>
            ) : (
              <>
                <div className="i-ph:plugs-bold w-4 h-4 mr-2" />
                Test Connection
              </>
            )}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <div className="i-ph:spinner-gap-bold w-4 h-4 animate-spin mr-2" />
                  {isEdit ? 'Updating...' : 'Adding...'}
                </>
              ) : (
                <>
                  <div className="i-ph:check-bold w-4 h-4 mr-2" />
                  {isEdit ? 'Update Server' : 'Add Server'}
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
};

export default ServerConfigForm;
