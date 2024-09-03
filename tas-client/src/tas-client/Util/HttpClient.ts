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
    constructor(
        private endpoint: string,
        private useNodeModules = typeof process !== 'undefined' && !!process.versions.node,
    ) {}

    public async get(config?: RequestConfig | undefined): Promise<FetchResult> {
        if (this.useNodeModules) {
            return this.nodeGet(config);
        } else {
            return this.webGet(config);
        }
    }

    private async nodeGet(config?: RequestConfig | undefined): Promise<FetchResult> {
        const http = await import('http');
        const https = await import('https');
        return new Promise<FetchResult>((resolve, reject) => {
            const req = (this.endpoint.startsWith('http:') ? http : https).get(
                this.endpoint,
                config || {},
                (res) => {
                    if (res.statusCode! < 200 || res.statusCode! > 299) {
                        reject(new FetchError('Response not ok', true, false));
                    } else {
                        res.on('error', reject);
                        const chunks: Buffer[] = [];
                        res.on('data', (chunk) => chunks.push(chunk));
                        res.on('end', () => {
                            try {
                                const data = JSON.parse(Buffer.concat(chunks).toString());
                                if (!data) {
                                    reject(new FetchError('No data received', false));
                                } else {
                                    resolve({ data });
                                }
                            } catch (err) {
                                reject(err);
                            }
                        });
                    }
                },
            );
            req.on('error', reject);
            req.end();
        });
    }

    private async webGet(config?: RequestConfig | undefined): Promise<FetchResult> {
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
