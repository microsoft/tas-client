/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, expect, vi } from 'vitest';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';

const unexpectedNetwork: string[] = [];

function requireLoopback(target: unknown, operation: string): void {
    const url = typeof target === 'string' || target instanceof URL ? new URL(target) : undefined;
    if (url?.protocol === 'http:' && url.hostname === '127.0.0.1') {
        return;
    }
    unexpectedNetwork.push(operation);
    throw new Error(`Unexpected network request in tests: ${operation}`);
}

beforeEach(() => {
    unexpectedNetwork.length = 0;
    const httpGet = http.get.bind(http);
    const httpRequest = http.request.bind(http);
    const httpsGet = https.get.bind(https);
    const httpsRequest = https.request.bind(https);
    const fetch = globalThis.fetch;
    vi.spyOn(http, 'get').mockImplementation((url, options, callback) => {
        requireLoopback(url, 'http.get');
        return httpGet(url, options, callback);
    });
    vi.spyOn(http, 'request').mockImplementation((url, options, callback) => {
        requireLoopback(url, 'http.request');
        return httpRequest(url, options, callback);
    });
    vi.spyOn(https, 'get').mockImplementation((url, options, callback) => {
        requireLoopback(url, 'https.get');
        return httpsGet(url, options, callback);
    });
    vi.spyOn(https, 'request').mockImplementation((url, options, callback) => {
        requireLoopback(url, 'https.request');
        return httpsRequest(url, options, callback);
    });
    vi.stubGlobal('fetch', (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        requireLoopback(input instanceof Request ? input.url : input, 'fetch');
        return fetch(input, init);
    });
    syncBuiltinESMExports();
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    syncBuiltinESMExports();
    expect(unexpectedNetwork).toEqual([]);
});
