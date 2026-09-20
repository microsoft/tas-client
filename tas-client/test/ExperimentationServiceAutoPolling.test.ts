/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExperimentationService, IFetchResponse } from '../src/index.js';
import { Deferred } from './mocks/Deferred.js';
import { ExperimentationTelemetryMock } from './mocks/ExperimentationTelemetryMock.js';
import { FetchMock, FetchResponseMock } from './mocks/FetchMock.js';

describe('ExperimentationService auto-polling lifecycle', () => {
    let transport: FetchMock;
    let services: ExperimentationService[];

    beforeEach(() => {
        vi.useFakeTimers();
        transport = new FetchMock();
        transport.fetch.mockResolvedValue(response());
        services = [];
    });

    afterEach(() => {
        services.forEach((service) => service.dispose());
        const remainingTimers = vi.getTimerCount();
        vi.useRealTimers();
        expect(remainingTimers).toBe(0);
    });

    function response() {
        return new FetchResponseMock({
            Configs: [{ Id: 'vscode', Parameters: { enabled: true } }],
            AssignmentContext: 'enabled;',
        });
    }

    function createService(refetchInterval = 1000) {
        const service = new ExperimentationService({
            endpoint: 'https://example.test/legacy',
            telemetry: new ExperimentationTelemetryMock(),
            assignmentContextTelemetryPropertyName: 'assignmentContext',
            telemetryEventName: 'query-expfeature',
            fetch: transport.fetch,
            refetchInterval,
        });
        services.push(service);
        return service;
    }

    it.each([-1, 1, 999])(
        'rejects a polling interval of %i ms without starting a request',
        (interval) => {
            expect(() => createService(interval)).toThrow(
                'The minimum refresh rate for polling is 1000 ms',
            );
            expect(transport.fetch).not.toHaveBeenCalled();
            expect(vi.getTimerCount()).toBe(0);
        },
    );

    it('fetches once with polling disabled and still permits manual refreshes', async () => {
        const service = createService(0);
        await service.initialFetch;
        await vi.advanceTimersByTimeAsync(60_000);
        expect(transport.fetch).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);

        expect(await service.getTreatmentVariableAsync('vscode', 'enabled')).toBe(true);
        expect(transport.fetch).toHaveBeenCalledTimes(2);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('fetches immediately and polls exactly at the configured interval', async () => {
        const service = createService();
        await service.initialFetch;
        expect(transport.fetch).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(999);
        expect(transport.fetch).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(transport.fetch).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1000);
        expect(transport.fetch).toHaveBeenCalledTimes(3);
        expect(vi.getTimerCount()).toBe(1);
    });

    it('does not overlap requests when a fetch takes longer than the polling interval', async () => {
        const pending = new Deferred<IFetchResponse>();
        transport.fetch.mockReturnValueOnce(pending.promise);
        const service = createService();
        await service.initializePromise;

        await vi.advanceTimersByTimeAsync(3000);
        expect(transport.fetch).toHaveBeenCalledTimes(1);
        pending.resolve(response());
        await service.initialFetch;
        await vi.advanceTimersByTimeAsync(1000);

        expect(transport.fetch).toHaveBeenCalledTimes(2);
        expect(vi.getTimerCount()).toBe(1);
    });

    it('suspends polling during a manual fetch and restarts the interval after completion', async () => {
        const service = createService();
        await service.initialFetch;
        await vi.advanceTimersByTimeAsync(600);
        const pending = new Deferred<IFetchResponse>();
        transport.fetch.mockReturnValueOnce(pending.promise);

        const manual = service.getTreatmentVariableAsync('vscode', 'enabled');
        await vi.advanceTimersByTimeAsync(0);
        expect(vi.getTimerCount()).toBe(0);
        await vi.advanceTimersByTimeAsync(3000);
        expect(transport.fetch).toHaveBeenCalledTimes(2);

        pending.resolve(response());
        expect(await manual).toBe(true);
        await vi.advanceTimersByTimeAsync(999);
        expect(transport.fetch).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1);
        expect(transport.fetch).toHaveBeenCalledTimes(3);
    });

    it('keeps polling after an initial endpoint failure', async () => {
        transport.fetch.mockRejectedValueOnce(new Error('Offline'));
        const service = createService();
        await service.initialFetch;

        await vi.advanceTimersByTimeAsync(1000);
        expect(transport.fetch).toHaveBeenCalledTimes(2);
        expect(service.getTreatmentVariable('vscode', 'enabled')).toBe(true);
    });

    it('resumes polling after a failed manual refresh without dropping the last good data', async () => {
        const service = createService();
        await service.initialFetch;
        transport.fetch.mockRejectedValueOnce(new Error('Offline'));

        expect(await service.getTreatmentVariableAsync('vscode', 'enabled')).toBe(true);
        expect(vi.getTimerCount()).toBe(1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(transport.fetch).toHaveBeenCalledTimes(3);
    });

    it('stops polling permanently when disposed during the initial fetch', async () => {
        const pending = new Deferred<IFetchResponse>();
        transport.fetch.mockReturnValueOnce(pending.promise);
        const service = createService();

        service.dispose();
        service.dispose();
        pending.resolve(response());
        await service.initialFetch;
        await vi.advanceTimersByTimeAsync(10_000);

        expect(transport.fetch).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('does not restart polling when an in-flight manual refresh finishes after disposal', async () => {
        const service = createService();
        await service.initialFetch;
        const pending = new Deferred<IFetchResponse>();
        transport.fetch.mockReturnValueOnce(pending.promise);

        const manual = service.getTreatmentVariableAsync('vscode', 'enabled');
        await vi.advanceTimersByTimeAsync(0);
        service.dispose();
        pending.resolve(response());
        expect(await manual).toBe(true);

        expect(vi.getTimerCount()).toBe(0);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(transport.fetch).toHaveBeenCalledTimes(2);
    });

    it('does not re-enable background work when explicitly queried after disposal', async () => {
        const service = createService();
        await service.initialFetch;
        service.dispose();

        expect(await service.getTreatmentVariableAsync('vscode', 'enabled')).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(transport.fetch).toHaveBeenCalledTimes(2);
    });
});
