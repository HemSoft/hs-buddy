// Lighthouse CI configuration for Electron renderer auditing.
// Docs: https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md
module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npx vite --port 9222',
      startServerReadyPattern: 'Local:',
      url: ['http://localhost:9222/'],
      numberOfRuns: 3,
      settings: {
        chromeFlags: '--no-sandbox --headless --disable-gpu --disable-dev-shm-usage',
        // Electron renderer doesn't need network audits
        onlyCategories: ['performance', 'accessibility', 'best-practices'],
        skipAudits: ['uses-http2', 'redirects-http', 'uses-long-cache-ttl'],
      },
    },
    assert: {
      assertions: {
        // Informational initially — promote to error once baselines are stable
        'categories:performance': ['warn', { minScore: 0.6 }],
        'categories:accessibility': ['warn', { minScore: 0.8 }],
        'categories:best-practices': ['warn', { minScore: 0.8 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: '.lighthouseci',
    },
  },
};
