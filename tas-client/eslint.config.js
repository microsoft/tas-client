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
    },
    {
        ...prettierRecommended,
        files: ['src/**/*.ts'],
    },
];
