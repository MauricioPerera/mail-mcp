const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      include: ['lib/**/*.js'],
      exclude: ['lib/mailclient.js', 'lib/idle-watcher.js']
    }
  }
});
