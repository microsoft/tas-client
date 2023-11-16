/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface RequestConfig {
    headers?: Record<string, string>;
}

export interface FetchResult {
    data: any;
}

export class FetchError extends Error {
    constructor(
        message: string,
        public readonly responseReceived?: boolean,
        public readonly responseOk?: boolean,
    ) {
        super(message);
    }
}

export class HttpClient {
    constructor(private endpoint: string) {}

    public async get(config?: RequestConfig | undefined): Promise<FetchResult> {
        const response = await fetch(this.endpoint, {
            method: 'GET',
            headers: config?.headers,
        });

        if (!response) {
            throw new FetchError('No response received', false);
        }

        if (!response.ok) {
            throw new FetchError('Response not ok', true, false);
        }

        const data = await response.json();
        if (!data) {
            throw new FetchError('No data received', false);
        }
        return { data };
    }
}
