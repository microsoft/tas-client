module.exports = {
    root: true,
    env: {
        node: true,
    },
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 2019,
        sourceType: 'module',
        project: './tsconfig.json',
    },
    extends: ['prettier'],
    plugins: ['prettier'],
    rules: {
        'prettier/prettier': 'error',
    },
};
