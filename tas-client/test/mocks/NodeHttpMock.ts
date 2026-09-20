/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventEmitter } from 'node:events';
import { RequestOptions } from 'node:http';
import { vi } from 'vitest';
import { Deferred } from './Deferred.js';

export class NodeHttpResponseMock extends EventEmitter {
    constructor(public readonly statusCode: number) {
        super();
    }

    public send(...chunks: Buffer[]): void {
        chunks.forEach((chunk) => this.emit('data', chunk));
        this.emit('end');
    }
}

export class NodeHttpRequestMock extends EventEmitter {
    public readonly write = vi.fn<(chunk: string) => boolean>().mockReturnValue(true);
    public readonly end = vi.fn();

    constructor(private readonly onResponse: (response: NodeHttpResponseMock) => void) {
        super();
    }

    public respond(statusCode: number): NodeHttpResponseMock {
        const response = new NodeHttpResponseMock(statusCode);
        this.onResponse(response);
        return response;
    }
}

export type NodeRequestFn = (
    url: string,
    options: RequestOptions,
    onResponse: (response: NodeHttpResponseMock) => void,
) => NodeHttpRequestMock;

// Models the request/response event boundary without opening sockets or scheduling timers.
export class NodeHttpMock {
    private readonly requests: Deferred<NodeHttpRequestMock>[] = [];
    private requestCount = 0;

    public readonly get = vi.fn<NodeRequestFn>((url, options, onResponse) => {
        const request = this.createRequest(onResponse);
        request.end();
        return request;
    });

    public readonly request = vi.fn<NodeRequestFn>((url, options, onResponse) =>
        this.createRequest(onResponse),
    );

    public requestAt(index = 0): Promise<NodeHttpRequestMock> {
        this.requests[index] ??= new Deferred<NodeHttpRequestMock>();
        return this.requests[index].promise;
    }

    private createRequest(onResponse: (response: NodeHttpResponseMock) => void) {
        const request = new NodeHttpRequestMock(onResponse);
        const index = this.requestCount++;
        this.requests[index] ??= new Deferred<NodeHttpRequestMock>();
        this.requests[index].resolve(request);
        return request;
    }
}
