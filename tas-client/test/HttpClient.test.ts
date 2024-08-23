/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as http from 'http';
import * as net from 'net';
import { expect } from 'chai';
import { FetchError, FetchResult, HttpClient } from '../src/tas-client/Util/HttpClient';
import { suiteSetup, suiteTeardown } from 'mocha';

describe('HttpClient Tests', () => {
    let port: number;
    let server: http.Server;
    const connections = new Set<net.Socket>();

    suiteSetup(async () => {
        port = await new Promise<number>((resolvePort, rejectPort) => {
            server = http
                .createServer((req, res) => {
                    res.setHeader('Content-Type', 'application/json');
                    const data: Buffer[] = [];
                    req.on('data', (chunk) => data.push(chunk));
                    req.on('end', () => {
                        res.end(
                            JSON.stringify({
                                method: req.method,
                                url: req.url,
                                headers: req.headers,
                                data: Buffer.concat(data).toString(),
                            }),
                        );
                    });
                })
                .listen(0, '127.0.0.1', () => {
                    const address = server.address();
                    resolvePort((address as net.AddressInfo).port);
                })
                .on('connection', (socket) => {
                    connections.add(socket);
                    socket.on('close', () => {
                        connections.delete(socket);
                    });
                })
                .on('error', (err) => {
                    rejectPort(err);
                });
        });
    });

    suiteTeardown(async () => {
        await new Promise<void>((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
            connections.forEach((socket) => socket.destroy());
        });
    });

    it('should use fetch', async () => {
        const path = '/test';
        const client = new HttpClient(`http://127.0.0.1:${port}${path}`, false);
        const result = await client.get({
            headers: {
                'echo-header': 'echo-fetch',
            },
        });
        expect(result.data.url).to.equal(path);
        expect(result.data.headers['echo-header']).to.equal('echo-fetch');
        expect(result.data.headers['user-agent']).to.equal('node'); // only set with fetch
    });

    it('should use Node.js modules', async () => {
        const path = '/test';
        const client = new HttpClient(`http://127.0.0.1:${port}${path}`, true);
        const result = await client.get({
            headers: {
                'echo-header': 'echo-http',
            },
        });
        expect(result.data.url).to.equal(path);
        expect(result.data.headers['echo-header']).to.equal('echo-http');
        expect(result.data.headers['user-agent']).to.equal(undefined); // only set with fetch
    });
});
