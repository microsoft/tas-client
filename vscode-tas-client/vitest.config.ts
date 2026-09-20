import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
    resolve: {
        alias: [
            {
                find: /^tas-client$/,
                replacement: resolve(__dirname, '..', 'tas-client', 'src', 'index.ts'),
            },
        ],
    },
    test: {
        globals: true,
        environment: 'node',
        include: ['test/**/*.test.ts'],
        exclude: ['node_modules', 'out'],
        setupFiles: ['test/setup.ts'],
    },
});
