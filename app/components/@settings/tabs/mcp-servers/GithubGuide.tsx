import { Card } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { useState } from 'react';
import { getGitHubMCPClient } from '~/lib/modules/mcp/github';

const GithubGuide = () => {
  const [testStatus, setTestStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  // Test GitHub connection
  const testGitHubConnection = async () => {
    try {
      setIsTestingConnection(true);
      setTestStatus({ success: false, message: 'Testing connection...' });

      // Get GitHub client
      const githubClient = getGitHubMCPClient();

      // Check if authenticated
      if (!githubClient.isAuthenticated()) {
        setTestStatus({
          success: false,
          message: 'GitHub token not found. Please make sure you have added a valid GitHub token.',
        });
        return;
      }

      // Test connection by getting user info
      const user = await githubClient.getUser();

      setTestStatus({
        success: true,
        message: `Connected successfully as ${user.login}. GitHub API tools available.`,
      });
    } catch (error) {
      setTestStatus({
        success: false,
        message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  return (
    <Card className="p-6 mt-6 bg-gray-50 dark:bg-gray-800">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Using GitHub MCP Server</h3>
        <Button
          onClick={testGitHubConnection}
          disabled={isTestingConnection}
          variant="outline"
          size="sm"
          className="flex items-center"
        >
          {isTestingConnection ? (
            <div className="i-ph:spinner-gap-bold w-4 h-4 animate-spin mr-2" />
          ) : (
            <div className="i-ph:plugs-bold w-4 h-4 mr-2" />
          )}
          Test Connection
        </Button>
      </div>

      {testStatus && (
        <div
          className={`mb-4 p-3 rounded-md ${
            testStatus.success
              ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
          }`}
        >
          <div className="flex items-center">
            <div className={`${testStatus.success ? 'i-ph:check-circle-bold' : 'i-ph:x-circle-bold'} w-5 h-5 mr-2`} />
            {testStatus.message}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <p className="text-gray-700 dark:text-gray-300">
          The GitHub MCP Server provides tools for interacting with the GitHub API. Here's how to use it:
        </p>

        <div className="space-y-2">
          <h4 className="font-medium text-gray-800 dark:text-gray-200">1. Configure the GitHub MCP Server</h4>
          <p className="text-gray-600 dark:text-gray-400">
            You've already added the GitHub MCP Server with your Personal Access Token.
          </p>
        </div>

        <div className="space-y-2">
          <h4 className="font-medium text-gray-800 dark:text-gray-200">2. Use GitHub API in Your Code</h4>
          <p className="text-gray-600 dark:text-gray-400">
            You can use the GitHub API client in your code to interact with GitHub:
          </p>
          <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded-md">
            <pre className="text-sm text-gray-700 dark:text-gray-300 overflow-x-auto">
              {`import { getGitHubMCPClient } from '~/lib/modules/mcp/github';

// Get GitHub client
const github = getGitHubMCPClient();

// Example: List repositories
const repos = await github.listRepositories();

// Example: Search repositories
const results = await github.searchRepositories('react');

// Example: Get repository contents
const contents = await github.getRepositoryContents('username', 'repo', 'README.md');`}
            </pre>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="font-medium text-gray-800 dark:text-gray-200">3. Available GitHub API Methods</h4>
          <p className="text-gray-600 dark:text-gray-400">The GitHub MCP client provides these methods:</p>
          <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 space-y-1">
            <li>
              <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">getUser()</code> - Get authenticated user info
            </li>
            <li>
              <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">listRepositories()</code> - List user
              repositories
            </li>
            <li>
              <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">searchRepositories(query)</code> - Search
              repositories
            </li>
            <li>
              <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                getRepositoryContents(owner, repo, path)
              </code>{' '}
              - Get file contents
            </li>
            <li>
              <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">createRepository(name, options)</code> -
              Create a new repository
            </li>
            <li>
              <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">request(endpoint, options)</code> - Make
              custom API requests
            </li>
          </ul>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/30 p-4 rounded-md border-l-4 border-yellow-400 dark:border-yellow-600">
          <div className="flex">
            <div className="flex-shrink-0">
              <div className="i-ph:info-bold w-5 h-5 text-yellow-600 dark:text-yellow-500" />
            </div>
            <div className="ml-3">
              <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Important Note</h4>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                Your GitHub token is stored locally and used to authenticate API requests. Make sure you understand the
                permissions you've granted through your token.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default GithubGuide;
