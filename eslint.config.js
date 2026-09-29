'use strict'

/**
 * Security-focused lint. The repository's own `scripts/check-forbidden-patterns.js`
 * covers the sinks ESLint cannot see (the editor HTML); this config covers the
 * runtime TypeScript: dangerous Node APIs, unsafe regex, `eval`, and `any` in the
 * new security module.
 */

const js = require('@eslint/js')
const tseslint = require('typescript-eslint')
const security = require('eslint-plugin-security')
const noUnsanitized = require('eslint-plugin-no-unsanitized')

module.exports = tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'test/e2e/**', '*.config.js'] },
  {
    files: ['src/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: { security, 'no-unsanitized': noUnsanitized },
    rules: {
      'security/detect-eval-with-expression': 'error',
      'security/detect-child-process': 'error',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-unsafe-regex': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'no-unsanitized/method': 'error',
      'no-unsanitized/property': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      // Pre-existing Node-RED node pattern (`const node = this`) and the
      // interface/class merge used to type createNode's members.
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/no-unsafe-declaration-merging': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  {
    // The sanitizer intentionally matches control characters; that is the point.
    files: ['src/security/sanitize.ts'],
    rules: { 'no-control-regex': 'off' },
  },
  {
    files: ['src/security/**/*.ts'],
    rules: {
      // New security code bans `any` outright.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['test/**/*.js', 'scripts/**/*.js', 'eslint.config.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-control-regex': 'off',
      'no-useless-escape': 'off',
    },
  }
)
