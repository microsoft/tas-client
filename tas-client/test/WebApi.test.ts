/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ExperimentationService,
    ExperimentationServiceConfig,
    IFetchResponse,
} from '../src/index.js';
import { HttpClient } from '../src/tas-client/Util/HttpClient.js';
import { MemoryKeyValueStorage } from '../src/tas-client/Util/MemoryKeyValueStorage.js';
import { createFeatureData } from './mocks/BaseFeatureProviderMock.js';
import { Deferred } from './mocks/Deferred.js';
import { ExperimentationFilterProviderMock } from './mocks/ExperimentationFilterProviderMock.js';
import { ExperimentationTelemetryMock } from './mocks/ExperimentationTelemetryMock.js';
import { FetchMock, FetchResponseMock } from './mocks/FetchMock.js';
import { HttpClientMock } from './mocks/HttpClientMock.js';
import { KeyValueStorageMock } from './mocks/KeyValueStorageMock.js';

describe('ExperimentationService endpoint integration', () => {
    const legacyEndpoint = 'https://example.test/legacy';
    const assignmentsEndpoint = 'https://example.test/assignments';
    let telemetry: ExperimentationTelemetryMock;
    let storage: KeyValueStorageMock;
    let transport: FetchMock;
    let services: ExperimentationService[];

    beforeEach(() => {
        telemetry = new ExperimentationTelemetryMock();
        storage = new KeyValueStorageMock();
        transport = new FetchMock();
        services = [];
    });

    afterEach(() => {
        services.forEach((service) => service.dispose());
    });

    function createService(options: Partial<ExperimentationServiceConfig> = {}) {
        const service = new ExperimentationService({
            endpoint: legacyEndpoint,
            telemetry,
            assignmentContextTelemetryPropertyName: 'assignmentContext',
            telemetryEventName: 'query-expfeature',
            keyValueStorage: storage,
            fetch: transport.fetch,
            ...options,
        });
        services.push(service);
        return service;
    }

    function legacyResponse() {
        return {
            Configs: [{ Id: 'vscode', Parameters: { variant: 'legacy', legacyOnly: 1 } }],
            AssignmentContext: 'legacy',
        };
    }

    function assignmentsResponse() {
        return {
            featureVariables: { '/vscode/variant': 'new', '/vscode/newOnly': 'false' },
            assignedVariants: [],
            dataVersion: 1,
            assignmentContext: 'new;',
        };
    }

    it('initially fetches through the public entry point with default options', async () => {
        const cacheWrite = vi.spyOn(MemoryKeyValueStorage.prototype, 'setValue');
        transport.respondWith(legacyResponse());
        const service = createService({ keyValueStorage: undefined });

        await Promise.all([service.initializePromise, service.initialFetch]);

        expect(transport.fetch).toHaveBeenCalledExactlyOnceWith(legacyEndpoint, {
            method: 'GET',
            headers: {},
        });
        expect(service.getTreatmentVariable('vscode', 'variant')).toBe('legacy');
        expect(service.isFlightEnabled('legacyOnly')).toBe(true);
        expect(cacheWrite).toHaveBeenCalledExactlyOnceWith('ABExp.Features', {
            features: ['variant', 'legacyOnly'],
            assignmentContext: 'legacy',
            configs: legacyResponse().Configs,
        });
    });

    it('keeps an initially missing treatment stable after it has already been queried', async () => {
        const pending = new Deferred<IFetchResponse>();
        transport.fetch.mockReturnValueOnce(pending.promise);
        const service = createService();
        await service.initializePromise;
        expect(service.getTreatmentVariable('vscode', 'variant')).toBeUndefined();

        pending.resolve(new FetchResponseMock(legacyResponse()));
        await service.initialFetch;

        expect(service.getTreatmentVariable('vscode', 'variant')).toBeUndefined();
        expect(await storage.getValue('ABExp.Features')).toMatchObject({
            configs: legacyResponse().Configs,
        });
    });

    it('starts both endpoints in parallel with separate filters and merges in registration order', async () => {
        const legacy = new Deferred<IFetchResponse>();
        const assignments = new Deferred<IFetchResponse>();
        transport.fetch
            .mockReturnValueOnce(legacy.promise)
            .mockReturnValueOnce(assignments.promise);
        const service = createService({
            assignmentsEndpoint,
            extensionName: 'example.extension',
            filterProviders: [new ExperimentationFilterProviderMock([['X-Legacy-Version', '1.0']])],
            assignmentsFilterProviders: [
                new ExperimentationFilterProviderMock([['Version', '2.0']]),
            ],
        });
        await service.initializePromise;

        expect(transport.fetch.mock.calls).toEqual([
            [legacyEndpoint, { method: 'GET', headers: { 'X-Legacy-Version': '1.0' } }],
            [
                assignmentsEndpoint,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userParams: { Version: '2.0' } }),
                },
            ],
        ]);

        assignments.resolve(new FetchResponseMock(assignmentsResponse()));
        legacy.resolve(new FetchResponseMock(legacyResponse()));
        await service.initialFetch;

        expect(service.getTreatmentVariable('vscode', 'variant')).toBe('new');
        expect(service.getTreatmentVariable('vscode', 'legacyOnly')).toBe(1);
        expect(service.getTreatmentVariable('vscode', 'newOnly')).toBe(false);
        expect(telemetry.sharedProperties.get('assignmentContext')).toBe('legacy;new;');
        expect(
            telemetry.eventsNamed('tas-call').map((event) => Object.fromEntries(event.args)),
        ).toEqual(
            expect.arrayContaining([
                {
                    callType: 'legacy',
                    outcome: 'Success',
                    extensionName: 'example.extension',
                    assignmentContext: 'legacy',
                },
                {
                    callType: 'assignments',
                    outcome: 'Success',
                    extensionName: 'example.extension',
                    assignmentContext: 'new;',
                },
            ]),
        );
    });

    it('lets an assignments-specific transport override the shared transport only for POST', async () => {
        transport.respondWith(legacyResponse());
        const assignments = new FetchMock();
        assignments.respondWith(assignmentsResponse());
        const service = createService({
            assignmentsEndpoint,
            assignmentsFetch: assignments.fetch,
            filterProviders: [new ExperimentationFilterProviderMock([['ClientId', 'client-1']])],
        });
        await service.initialFetch;

        expect(transport.fetch).toHaveBeenCalledTimes(1);
        expect(transport.fetch.mock.calls[0][1].method).toBe('GET');
        expect(assignments.fetch).toHaveBeenCalledExactlyOnceWith(assignmentsEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userParams: { ClientId: 'client-1' } }),
        });
        expect(service.getTreatmentVariable('vscode', 'variant')).toBe('new');
    });

    it('honors an explicitly empty assignments filter list instead of falling back to legacy filters', async () => {
        transport.respondWith(legacyResponse());
        const service = createService({
            assignmentsEndpoint,
            filterProviders: [new ExperimentationFilterProviderMock([['X-Legacy', 'value']])],
            assignmentsFilterProviders: [],
        });
        await service.initialFetch;

        expect(transport.fetch).toHaveBeenCalledTimes(1);
        expect(service.getTreatmentVariable('vscode', 'variant')).toBe('legacy');
        expect(telemetry.eventsNamed('tas-call')).toHaveLength(1);
    });

    it('uses the built-in transports when no fetch override is configured', async () => {
        const http = new HttpClientMock();
        http.get.mockResolvedValueOnce({ data: legacyResponse() });
        http.post.mockResolvedValueOnce({ data: assignmentsResponse() });
        vi.spyOn(HttpClient.prototype, 'get').mockImplementation(http.get);
        vi.spyOn(HttpClient.prototype, 'post').mockImplementation(http.post);
        const service = createService({
            fetch: undefined,
            assignmentsEndpoint,
            filterProviders: [new ExperimentationFilterProviderMock([['ClientId', 'client-1']])],
        });
        await service.initialFetch;

        expect(http.get).toHaveBeenCalledExactlyOnceWith({ headers: { ClientId: 'client-1' } });
        expect(http.post).toHaveBeenCalledExactlyOnceWith({
            body: { userParams: { ClientId: 'client-1' } },
        });
        expect(transport.fetch).not.toHaveBeenCalled();
        expect(service.getTreatmentVariable('vscode', 'variant')).toBe('new');
    });

    it.each(['legacy', 'assignments'])(
        'still uses successful data when the %s endpoint fails',
        async (failure) => {
            transport.respondWith(legacyResponse(), failure === 'legacy' ? 503 : 200);
            transport.respondWith(assignmentsResponse(), failure === 'assignments' ? 503 : 200);
            const service = createService({
                assignmentsEndpoint,
                filterProviders: [
                    new ExperimentationFilterProviderMock([['ClientId', 'client-1']]),
                ],
            });
            await service.initialFetch;

            expect(service.getTreatmentVariable('vscode', 'variant')).toBe(
                failure === 'legacy' ? 'new' : 'legacy',
            );
            expect(
                telemetry
                    .eventsNamed('tas-call')
                    .map((event) => event.args.get('outcome'))
                    .sort(),
            ).toEqual(['ServerError', 'Success']);
        },
    );

    it('retains the previous session cache when both endpoints fail and can recover', async () => {
        const cached = createFeatureData({
            assignmentContext: 'cached;',
            configs: [{ Id: 'vscode', Parameters: { variant: 'cached' } }],
        });
        storage.setValue('ABExp.Features', cached);
        transport.fetch
            .mockRejectedValueOnce(new Error('Offline'))
            .mockRejectedValueOnce(new Error('Offline'));
        const service = createService({
            assignmentsEndpoint,
            filterProviders: [new ExperimentationFilterProviderMock([['ClientId', 'client-1']])],
        });
        await Promise.all([service.initializePromise, service.initialFetch]);

        expect(service.getTreatmentVariable('vscode', 'variant')).toBe('cached');
        expect(await storage.getValue('ABExp.Features')).toEqual(cached);
        expect(storage.writes).toHaveLength(1);

        transport.respondWith(legacyResponse());
        transport.respondWith(assignmentsResponse());
        expect(await service.getTreatmentVariableAsync('vscode', 'variant')).toBe('new');
        expect(transport.fetch).toHaveBeenCalledTimes(4);
        expect(telemetry.sharedProperties.get('assignmentContext')).toBe('legacy;new;');
    });

    it('treats legacy configs without parameters as having no treatment variables', async () => {
        transport.respondWith({
            Configs: [{ Id: 'missing' }, { Id: 'null', Parameters: null }],
            AssignmentContext: '',
        });
        const service = createService();
        await service.initialFetch;

        expect(service.getTreatmentVariable('missing', 'flag')).toBeUndefined();
        expect(service.getTreatmentVariable('null', 'flag')).toBeUndefined();
    });
});
