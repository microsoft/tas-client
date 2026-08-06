'use strict';

const prettierRecommended = require('eslint-plugin-prettier/recommended');
const typescriptParser = require('@typescript-eslint/parser');

module.exports = [
    {
        ...prettierRecommended,
        files: ['src/**/*.ts'],
        languageOptions: {
            parser: typescriptParser,
            parserOptions: {
                ecmaVersion: 2019,
                sourceType: 'module',
                project: './tsconfig.json',
            },
        },
    },
];
