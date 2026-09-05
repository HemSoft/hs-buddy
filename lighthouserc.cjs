// Lighthouse CI configuration for Electron renderer auditing.
// Docs: https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md
module.exports = {
  ci: {
    collect: {
      staticDistDir: './dist',
      isSinglePageApplication: true,
      url: ['http://localhost/'],
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
        // Preserve the maintained floors; median aggregation limits single-run noise.
        'categories:performance': ['error', { minScore: 0.6, aggregationMethod: 'median' }],
        'categories:accessibility': ['error', { minScore: 0.8, aggregationMethod: 'median' }],
        'categories:best-practices': ['error', { minScore: 0.8, aggregationMethod: 'median' }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: '.lighthouseci',
    },
  },
}
