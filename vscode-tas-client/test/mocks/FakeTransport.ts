/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AssignmentsFetchFn, FetchFn, IFetchResponse } from 'tas-client';
import { Deferred } from './Deferred';

type RequestInit = Parameters<FetchFn>[1];

export interface RecordedRequest {
    url: string;
    init: RequestInit;
}

export class FakeResponse implements IFetchResponse {
    constructor(
        private readonly data: unknown,
        public readonly status = 200,
    ) {}

    public async json(): Promise<unknown> {
        return structuredClone(this.data);
    }
}

export class FakeTransport {
    public readonly requests: RecordedRequest[] = [];
    public readonly unexpectedRequests: RecordedRequest[] = [];
    private readonly responses: {
        url: string;
        method: RequestInit['method'];
        respond: () => Promise<IFetchResponse>;
    }[] = [];

    public readonly fetch: FetchFn = (url, init) => {
        const request = { url, init: { ...init, headers: { ...init.headers } } };
        this.requests.push(request);
        const index = this.responses.findIndex(
            (response) => response.url === url && response.method === init.method,
        );
        if (index === -1) {
            this.unexpectedRequests.push(request);
            return Promise.reject(new Error(`Unexpected request: ${init.method} ${url}`));
        }
        const [response] = this.responses.splice(index, 1);
        return response.respond();
    };

    public readonly assignmentsFetch: AssignmentsFetchFn = (url, init) => this.fetch(url, init);

    public respondWith(
        url: string,
        method: RequestInit['method'],
        data: unknown,
        status = 200,
    ): void {
        this.responses.push({
            url,
            method,
            respond: () => Promise.resolve(new FakeResponse(data, status)),
        });
    }

    public rejectWith(url: string, method: RequestInit['method'], error: Error): void {
        this.responses.push({ url, method, respond: () => Promise.reject(error) });
    }

    public defer(url: string, method: RequestInit['method']): Deferred<IFetchResponse> {
        const deferred = new Deferred<IFetchResponse>();
        this.responses.push({ url, method, respond: () => deferred.promise });
        return deferred;
    }

    public get pendingResponseCount(): number {
        return this.responses.length;
    }
}
