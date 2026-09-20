/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vi } from 'vitest';
import { HttpClient } from '../../src/tas-client/Util/HttpClient.js';

export class HttpClientMock extends HttpClient {
    public readonly get = vi
        .fn<HttpClient['get']>()
        .mockRejectedValue(new Error('Unexpected HTTP GET'));
    public readonly post = vi
        .fn<HttpClient['post']>()
        .mockRejectedValue(new Error('Unexpected HTTP POST'));

    constructor() {
        super('https://unused.example.test');
    }
}
