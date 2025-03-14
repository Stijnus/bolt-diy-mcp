#!/usr/bin/env node

/**
 * GitHub Connection Checker
 *
 * This script checks the GitHub connection status using a provided token.
 * Run it with: node check-github-connection.js [token]
 */

// Import fetch for Node.js environments
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

async function checkGitHubConnection(token) {
  console.log('Checking GitHub connection...\n');

  if (!token) {
    console.log('❌ No GitHub token provided');
    console.log('Usage: node check-github-connection.js [token]');
    console.log(
      'Or set the GITHUB_TOKEN environment variable: GITHUB_TOKEN=your_token node check-github-connection.js',
    );
    return;
  }

  try {
    // Create an abort controller with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const user = await response.json();
      console.log('✅ GitHub connection is working!');
      console.log(`User: ${user.login}${user.name ? ` (${user.name})` : ''}`);
      console.log(`Email: ${user.email || 'Not public'}`);
      console.log(`Public Repos: ${user.public_repos}`);
      console.log(`Account created: ${new Date(user.created_at).toLocaleDateString()}`);
    } else {
      const errorText = await response.text();
      console.log(`❌ GitHub connection failed: ${response.status} ${response.statusText}`);
      console.log(`Error: ${errorText}`);
    }
  } catch (error) {
    console.log(`❌ GitHub connection failed: ${error.message}`);
  }
}

// Get token from command line arguments or environment variable
const token = process.argv[2] || process.env.GITHUB_TOKEN;
checkGitHubConnection(token).catch((error) => {
  console.error('Error checking GitHub connection:', error);
});
