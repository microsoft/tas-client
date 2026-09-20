/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, expect, vi } from 'vitest';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { fakeVSCode } from './mocks/FakeVSCode';

const unexpectedNetwork: string[] = [];

function blockNetwork(operation: string): never {
    unexpectedNetwork.push(operation);
    throw new Error(`Real network is forbidden in tests: ${operation}`);
}

vi.mock('vscode', async () => {
    const { fakeVSCode } = await import('./mocks/FakeVSCode');
    return {
        get version() {
            return fakeVSCode.version;
        },
        env: fakeVSCode.env,
        workspace: fakeVSCode.workspace,
    };
});

beforeEach(() => {
    fakeVSCode.reset();
    unexpectedNetwork.length = 0;
    vi.spyOn(http, 'get').mockImplementation(() => blockNetwork('http.get'));
    vi.spyOn(http, 'request').mockImplementation(() => blockNetwork('http.request'));
    vi.spyOn(https, 'get').mockImplementation(() => blockNetwork('https.get'));
    vi.spyOn(https, 'request').mockImplementation(() => blockNetwork('https.request'));
    vi.stubGlobal('fetch', () => blockNetwork('fetch'));
    syncBuiltinESMExports();
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    syncBuiltinESMExports();
    expect(unexpectedNetwork).toEqual([]);
});
