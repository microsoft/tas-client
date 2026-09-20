/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vi } from 'vitest';
import { FetchFn, IFetchResponse } from '../../src/contracts/ExperimentationServiceConfig.js';

export class FetchResponseMock implements IFetchResponse {
    public readonly json = vi.fn<IFetchResponse['json']>();

    constructor(
        data: unknown,
        public readonly status = 200,
    ) {
        this.json.mockResolvedValue(data);
    }
}

export class FetchMock {
    public readonly fetch = vi
        .fn<FetchFn>()
        .mockRejectedValue(new Error('Unexpected fetch request'));

    public respondWith(data: unknown, status = 200): FetchResponseMock {
        const response = new FetchResponseMock(data, status);
        this.fetch.mockResolvedValueOnce(response);
        return response;
    }
}
