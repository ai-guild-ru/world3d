// @ts-check

const eslint = require('@eslint/js')
const tseslint = require('typescript-eslint')
const unusedImports = require('eslint-plugin-unused-imports')

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  {
    ignores: ['node_modules/**', 'dist/**', 'eslint.config.cjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    plugins: {
      'unused-imports': unusedImports,
    },
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [],
        },
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-extra-semi': 'off',
      '@typescript-eslint/no-empty-function': 'error',
      'unused-imports/no-unused-imports': 'error',
      'no-console': [
        'error',
        { allow: ['warn', 'error'] },
      ],
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always'],
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
]
