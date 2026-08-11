import tslintPlugin from '@typescript-eslint/eslint-plugin-tslint';
import typescriptParser from '@typescript-eslint/parser';
import prettierRecommended from 'eslint-plugin-prettier/recommended';

export default [
    {
        ignores: ['node_modules/**', 'out/**'],
    },
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parser: typescriptParser,
            parserOptions: {
                ecmaVersion: 2019,
                project: './tsconfig.json',
                sourceType: 'module',
            },
        },
        plugins: {
            '@typescript-eslint/tslint': tslintPlugin,
        },
        rules: {
            '@typescript-eslint/tslint/config': ['error', { lintFile: './tslint.json' }],
        },
    },
    {
        ...prettierRecommended,
        files: ['src/**/*.ts'],
    },
];
