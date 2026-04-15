const globals = require('globals');

module.exports = [
  {
    files: ['server.js', 'scripts/**/*.js', 'public/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-var': 'warn',
      eqeqeq: ['warn', 'smart']
    }
  },
  // Some pages use Chart.js via CDN; treat Chart as a known global.
  {
    files: ['public/js/**/*.js'],
    languageOptions: {
      globals: {
        Chart: 'readonly'
      }
    }
  }
];

