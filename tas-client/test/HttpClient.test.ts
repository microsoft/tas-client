/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FetchError, HttpClient, PostRequestConfig } from '../src/tas-client/Util/HttpClient.js';
import { NodeHttpMock, NodeRequestFn } from './mocks/NodeHttpMock.js';

const modules = vi.hoisted(() => ({
    http: { get: vi.fn<NodeRequestFn>(), request: vi.fn<NodeRequestFn>() },
    https: { get: vi.fn<NodeRequestFn>(), request: vi.fn<NodeRequestFn>() },
}));
vi.mock('http', () => modules.http);
vi.mock('https', () => modules.https);

let http: NodeHttpMock;
let https: NodeHttpMock;

beforeEach(() => {
    http = new NodeHttpMock();
    https = new NodeHttpMock();
    modules.http.get.mockReset().mockImplementation(http.get);
    modules.http.request.mockReset().mockImplementation(http.request);
    modules.https.get.mockReset().mockImplementation(https.get);
    modules.https.request.mockReset().mockImplementation(https.request);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe.each(['get', 'post'] as const)('HttpClient browser %s', (method) => {
    const endpoint = 'https://example.test/data';
    let fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>;
    let client: HttpClient;

    beforeEach(() => {
        fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error('Unexpected fetch'));
        vi.stubGlobal('fetch', fetch);
        client = new HttpClient(endpoint, false);
    });

    it('forwards the method, headers, and JSON body and parses the response', async () => {
        const data = { assignmentContext: 'variant;', featureVariables: { enabled: 'true' } };
        const body = { userParams: { Version: '1.0' } };
        const headers = { 'X-Client': 'extension' };
        const config: PostRequestConfig = method === 'get' ? { headers } : { headers, body };
        fetch.mockResolvedValueOnce(new Response(JSON.stringify(data)));

        expect(await client[method](config)).toEqual({ data });
        expect(fetch).toHaveBeenCalledExactlyOnceWith(
            endpoint,
            method === 'get'
                ? { method: 'GET', headers }
                : {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', ...headers },
                      body: JSON.stringify(body),
                  },
        );
        expect(http.get).not.toHaveBeenCalled();
        expect(https.get).not.toHaveBeenCalled();
        expect(http.request).not.toHaveBeenCalled();
        expect(https.request).not.toHaveBeenCalled();
    });

    it('supports omitted request options', async () => {
        fetch.mockResolvedValueOnce(new Response('{}'));

        expect(await client[method]()).toEqual({ data: {} });
        expect(fetch).toHaveBeenCalledExactlyOnceWith(
            endpoint,
            method === 'get'
                ? { method: 'GET', headers: undefined }
                : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
        );
    });

    it.each([400, 503])(
        'rejects HTTP status %i without trying to decode the response',
        async (status) => {
            const response = new Response('not JSON', { status });
            const json = vi.spyOn(response, 'json');
            fetch.mockResolvedValueOnce(response);

            await expect(client[method]()).rejects.toMatchObject({
                message: 'Response not ok',
                responseReceived: true,
                responseOk: false,
            });
            expect(json).not.toHaveBeenCalled();
        },
    );

    it('propagates a rejected transport request', async () => {
        const error = new Error('Connection reset');
        fetch.mockRejectedValueOnce(error);

        await expect(client[method]()).rejects.toBe(error);
    });

    it('reports a polyfill that returns no response', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn<() => Promise<Response | undefined>>().mockResolvedValue(undefined),
        );

        await expect(client[method]()).rejects.toMatchObject({
            message: 'No response received',
            responseReceived: false,
        });
    });

    it.each([null, false, 0, ''])('rejects an unusable JSON payload (%j)', async (data) => {
        fetch.mockResolvedValueOnce(new Response(JSON.stringify(data)));

        await expect(client[method]()).rejects.toMatchObject({
            message: 'No data received',
            responseReceived: false,
        });
    });

    it.each(['', '{"incomplete":', '<html>Service unavailable</html>'])(
        'propagates JSON parsing errors for %j',
        async (body) => {
            fetch.mockResolvedValueOnce(new Response(body));

            await expect(client[method]()).rejects.toBeInstanceOf(SyntaxError);
        },
    );

    it('propagates a response body stream failure', async () => {
        const error = new Error('Body interrupted');
        const body = new ReadableStream({
            start(controller) {
                controller.error(error);
            },
        });
        fetch.mockResolvedValueOnce(new Response(body));

        await expect(client[method]()).rejects.toBe(error);
    });
});

describe.each(['get', 'post'] as const)('HttpClient native %s', (method) => {
    it.each(['http', 'https'])(
        'routes %s requests and decodes JSON split across UTF-8 chunks',
        async (protocol) => {
            const endpoint = `${protocol}://example.test/data`;
            const transport = protocol === 'http' ? http : https;
            const unused = protocol === 'http' ? https : http;
            const client = new HttpClient(endpoint);
            const body = { userParams: { Label: 'caf\u00e9' } };
            const payload = JSON.stringify(body);
            const headers = { 'X-Client': 'extension' };
            const config: PostRequestConfig = method === 'get' ? { headers } : { headers, body };
            const result = client[method](config);
            const request = await transport.requestAt();

            if (method === 'get') {
                expect(transport.get).toHaveBeenCalledExactlyOnceWith(
                    endpoint,
                    { headers },
                    expect.any(Function),
                );
                expect(request.write).not.toHaveBeenCalled();
            } else {
                expect(transport.request).toHaveBeenCalledExactlyOnceWith(
                    endpoint,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(payload).toString(),
                            ...headers,
                        },
                    },
                    expect.any(Function),
                );
                expect(request.write).toHaveBeenCalledExactlyOnceWith(payload);
                expect(Buffer.byteLength(payload)).toBeGreaterThan(payload.length);
            }
            expect(request.end).toHaveBeenCalled();
            expect(unused.get).not.toHaveBeenCalled();
            expect(unused.request).not.toHaveBeenCalled();

            const data = { label: 'caf\u00e9', assignmentContext: 'variant;' };
            const bytes = Buffer.from(JSON.stringify(data));
            const split = bytes.indexOf(0xc3) + 1;
            request.respond(200).send(bytes.subarray(0, split), bytes.subarray(split));

            expect(await result).toEqual({ data });
        },
    );

    it('supports omitted options and the upper successful status boundary', async () => {
        const endpoint = 'http://example.test/data';
        const result = new HttpClient(endpoint, true)[method]();
        const request = await http.requestAt();
        request.respond(299).send(Buffer.from('{}'));

        expect(await result).toEqual({ data: {} });
        if (method === 'get') {
            expect(http.get).toHaveBeenCalledWith(endpoint, {}, expect.any(Function));
        } else {
            expect(request.write).toHaveBeenCalledExactlyOnceWith('{}');
            expect(http.request).toHaveBeenCalledWith(
                endpoint,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Content-Length': '2' },
                },
                expect.any(Function),
            );
        }
    });

    it.each([199, 300, 503])('rejects HTTP status %i', async (status) => {
        const result = new HttpClient('http://example.test/data', true)[method]();
        const assertion = expect(result).rejects.toMatchObject({
            message: 'Response not ok',
            responseReceived: true,
            responseOk: false,
        });
        const request = await http.requestAt();
        request.respond(status);

        await assertion;
    });

    it('propagates request errors, such as DNS or connection failures', async () => {
        const error = new Error('Connection refused');
        const result = new HttpClient('http://example.test/data', true)[method]();
        const assertion = expect(result).rejects.toBe(error);
        const request = await http.requestAt();
        request.emit('error', error);

        await assertion;
    });

    it('propagates response stream errors rather than waiting forever for end', async () => {
        const error = new Error('Response stream interrupted');
        const result = new HttpClient('https://example.test/data', true)[method]();
        const assertion = expect(result).rejects.toBe(error);
        const request = await https.requestAt();
        request.respond(200).emit('error', error);

        await assertion;
    });

    it.each(['', '{"incomplete":', '<html>Service unavailable</html>'])(
        'rejects invalid JSON %j',
        async (data) => {
            const result = new HttpClient('http://example.test/data', true)[method]();
            const assertion = expect(result).rejects.toBeInstanceOf(SyntaxError);
            const request = await http.requestAt();
            request.respond(200).send(Buffer.from(data));

            await assertion;
        },
    );

    it.each([null, false, 0, ''])('rejects an unusable JSON payload (%j)', async (data) => {
        const result = new HttpClient('http://example.test/data', true)[method]();
        const assertion = expect(result).rejects.toMatchObject({
            message: 'No data received',
            responseReceived: false,
        });
        const request = await http.requestAt();
        request.respond(200).send(Buffer.from(JSON.stringify(data)));

        await assertion;
    });
});

describe('HttpClient environment and POST defaults', () => {
    it.each([undefined, { versions: {} }])(
        'selects fetch when Node is not detected (%j)',
        async (process) => {
            let client: HttpClient;
            try {
                vi.stubGlobal('process', process);
                client = new HttpClient('https://example.test/data');
            } finally {
                vi.unstubAllGlobals();
            }
            const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('{}'));
            vi.stubGlobal('fetch', fetch);

            expect(await client.get()).toEqual({ data: {} });
            expect(fetch).toHaveBeenCalledTimes(1);
            expect(https.get).not.toHaveBeenCalled();
        },
    );

    it.each([true, false])(
        'uses an empty JSON body for null and honors custom POST headers (Node: %s)',
        async (node) => {
            const endpoint = 'http://example.test/data';
            const headers = { 'Content-Type': 'application/custom+json', 'X-Client': 'extension' };
            const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('{}'));
            vi.stubGlobal('fetch', fetch);
            const result = new HttpClient(endpoint, node).post({ body: null, headers });
            if (node) {
                const request = await http.requestAt();
                request.respond(200).send(Buffer.from('{}'));
                expect(request.write).toHaveBeenCalledExactlyOnceWith('{}');
                expect(http.request).toHaveBeenCalledWith(
                    endpoint,
                    {
                        method: 'POST',
                        headers: { 'Content-Length': '2', ...headers },
                    },
                    expect.any(Function),
                );
            } else {
                expect(fetch).toHaveBeenCalledExactlyOnceWith(endpoint, {
                    method: 'POST',
                    headers,
                    body: '{}',
                });
            }
            expect(await result).toEqual({ data: {} });
        },
    );

    it.each([true, false])(
        'rejects unserializable POST bodies before making a request (Node: %s)',
        async (node) => {
            const fetch = vi.fn<typeof globalThis.fetch>();
            vi.stubGlobal('fetch', fetch);

            await expect(
                new HttpClient('http://example.test/data', node).post({ body: 1n }),
            ).rejects.toBeInstanceOf(TypeError);
            expect(http.request).not.toHaveBeenCalled();
            expect(fetch).not.toHaveBeenCalled();
        },
    );

    it('preserves FetchError metadata and the original message', () => {
        const error = new FetchError('Gateway error', true, false);
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBe('Gateway error');
        expect(error.responseReceived).toBe(true);
        expect(error.responseOk).toBe(false);
    });
});
