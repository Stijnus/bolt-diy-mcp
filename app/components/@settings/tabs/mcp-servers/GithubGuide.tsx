import { Card } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { useState } from 'react';
import { getGitHubMCPClient } from '~/lib/modules/mcp/github';
import { Badge } from '~/components/ui/Badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/Tabs';

const GithubGuide = () => {
  const [testStatus, setTestStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [githubUser, setGithubUser] = useState<{ login: string; avatar_url?: string } | null>(null);

  // Test GitHub connection
  const testGitHubConnection = async () => {
    try {
      setIsTestingConnection(true);
      setTestStatus({ success: false, message: 'Testing connection...' });
      setGithubUser(null);

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
      setGithubUser(user);

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
    <Card className="p-6 mt-6 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center">
          <div className="i-ph:github-logo w-6 h-6 text-gray-800 dark:text-white mr-3" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">GitHub MCP Integration</h3>
          <Badge
            variant="outline"
            className="ml-2 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
          >
            Connected
          </Badge>
        </div>
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
          className={`mb-6 p-4 rounded-md ${
            testStatus.success
              ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
          }`}
        >
          <div className="flex items-start">
            <div
              className={`${testStatus.success ? 'i-ph:check-circle-bold' : 'i-ph:x-circle-bold'} w-5 h-5 mr-3 mt-0.5 flex-shrink-0`}
            />
            <div>
              <p className="font-medium">{testStatus.success ? 'Connection Successful' : 'Connection Failed'}</p>
              <p className="text-sm mt-1">{testStatus.message}</p>

              {githubUser && (
                <div className="mt-3 flex items-center p-3 bg-white dark:bg-gray-700 rounded-md">
                  {githubUser.avatar_url && (
                    <img
                      src={githubUser.avatar_url}
                      alt={`${githubUser.login}'s avatar`}
                      className="w-8 h-8 rounded-full mr-3"
                    />
                  )}
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{githubUser.login}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">GitHub account connected</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="usage">Usage Guide</TabsTrigger>
          <TabsTrigger value="api">API Reference</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="flex items-start">
            <div className="i-ph:info-circle w-5 h-5 text-blue-500 mr-3 mt-1 flex-shrink-0" />
            <p className="text-gray-700 dark:text-gray-300">
              The GitHub MCP Server provides tools for interacting with the GitHub API directly from your AI
              conversations. This integration allows the AI to search repositories, access file contents, and perform
              other GitHub operations.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center mb-2">
                <div className="i-ph:code w-5 h-5 text-purple-500 mr-2" />
                <h4 className="font-medium">Repository Access</h4>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Access your repositories, search for code, and retrieve file contents directly through AI conversations.
              </p>
            </div>

            <div className="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center mb-2">
                <div className="i-ph:git-branch w-5 h-5 text-green-500 mr-2" />
                <h4 className="font-medium">Git Operations</h4>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Create repositories, manage branches, and perform other Git operations through natural language
                commands.
              </p>
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-md border-l-4 border-blue-400 dark:border-blue-600 mt-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <div className="i-ph:lightbulb w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="ml-3">
                <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200">Pro Tip</h4>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Try asking the AI to "search for React repositories on GitHub" or "show me the README from my
                  repository" to see the GitHub MCP integration in action.
                </p>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="usage" className="space-y-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-medium text-gray-800 dark:text-gray-200 flex items-center">
                <div className="i-ph:check-circle w-5 h-5 text-green-500 mr-2" />
                1. Configure the GitHub MCP Server
              </h4>
              <p className="text-gray-600 dark:text-gray-400 ml-7">
                You've already added the GitHub MCP Server with your Personal Access Token.
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium text-gray-800 dark:text-gray-200 flex items-center">
                <div className="i-ph:code w-5 h-5 text-purple-500 mr-2" />
                2. Use GitHub API in Your Code
              </h4>
              <p className="text-gray-600 dark:text-gray-400 ml-7">
                You can use the GitHub API client in your code to interact with GitHub:
              </p>
              <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-md ml-7 border border-gray-200 dark:border-gray-600">
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
              <h4 className="font-medium text-gray-800 dark:text-gray-200 flex items-center">
                <div className="i-ph:chat-centered-text w-5 h-5 text-blue-500 mr-2" />
                3. Use in AI Conversations
              </h4>
              <p className="text-gray-600 dark:text-gray-400 ml-7">
                You can now use GitHub-related commands in your conversations with the AI. Try these examples:
              </p>
              <ul className="ml-7 space-y-2 mt-2">
                <li className="bg-white dark:bg-gray-700 p-3 rounded-md border border-gray-200 dark:border-gray-600">
                  "Search for repositories about machine learning"
                </li>
                <li className="bg-white dark:bg-gray-700 p-3 rounded-md border border-gray-200 dark:border-gray-600">
                  "Show me the README from the repository username/repo"
                </li>
                <li className="bg-white dark:bg-gray-700 p-3 rounded-md border border-gray-200 dark:border-gray-600">
                  "Create a new repository called my-project"
                </li>
              </ul>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="api" className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            The GitHub MCP client provides these methods for interacting with the GitHub API:
          </p>

          <div className="overflow-hidden border border-gray-200 dark:border-gray-700 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-100 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Method
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-700 divide-y divide-gray-200 dark:divide-gray-800">
                <tr>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-sm">getUser()</code>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    Get authenticated user information
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-sm">listRepositories()</code>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    List repositories for the authenticated user
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-sm">
                      searchRepositories(query)
                    </code>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    Search for repositories matching the query
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-sm">
                      getRepositoryContents(owner, repo, path)
                    </code>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    Get contents of a file or directory in a repository
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-sm">
                      createRepository(name, options)
                    </code>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    Create a new repository with the given name and options
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-sm">
                      request(endpoint, options)
                    </code>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    Make custom API requests to any GitHub API endpoint
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/30 p-4 rounded-md border-l-4 border-yellow-400 dark:border-yellow-600 mt-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <div className="i-ph:warning w-5 h-5 text-yellow-600 dark:text-yellow-500" />
              </div>
              <div className="ml-3">
                <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Security Note</h4>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  Your GitHub token is stored locally and used to authenticate API requests. Make sure you understand
                  the permissions you've granted through your token. For security, use tokens with the minimum required
                  permissions.
                </p>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
};

export default GithubGuide;
