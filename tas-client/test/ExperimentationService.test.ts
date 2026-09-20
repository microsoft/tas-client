/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ConfigData,
    FeatureData,
    IFeatureProvider,
} from '../src/tas-client/FeatureProvider/IFeatureProvider.js';
import { MemoryKeyValueStorage } from '../src/tas-client/Util/MemoryKeyValueStorage.js';
import { BaseFeatureProviderMock, createFeatureData } from './mocks/BaseFeatureProviderMock.js';
import { Deferred } from './mocks/Deferred.js';
import { ExperimentationServiceMock } from './mocks/ExperimentationServiceMock.js';
import { ExperimentationTelemetryMock } from './mocks/ExperimentationTelemetryMock.js';
import { KeyValueStorageMock } from './mocks/KeyValueStorageMock.js';

describe('ExperimentationServiceBase', () => {
    let telemetry: ExperimentationTelemetryMock;
    let storage: KeyValueStorageMock;
    let cached: FeatureData;
    let fresh: FeatureData;
    let services: ExperimentationServiceMock[];

    beforeEach(() => {
        telemetry = new ExperimentationTelemetryMock();
        storage = new KeyValueStorageMock();
        services = [];
        cached = createFeatureData({
            features: ['cachedFlight'],
            assignmentContext: 'cached;',
            configs: [
                {
                    Id: 'vscode',
                    Parameters: { variant: 'control', enabled: false, rollout: 0, label: '' },
                },
            ],
        });
        fresh = createFeatureData({
            features: ['freshFlight'],
            assignmentContext: 'fresh;',
            configs: [{ Id: 'vscode', Parameters: { variant: 'treatment' } }],
        });
    });

    afterEach(() => {
        services.forEach((service) => service.dispose());
    });

    function createService(providers?: IFeatureProvider[]) {
        const service = new ExperimentationServiceMock(providers, {
            telemetry,
            keyValueStorage: storage,
        });
        services.push(service);
        return service;
    }

    it('uses the built-in storage and default storage key when none are supplied', async () => {
        const service = new ExperimentationServiceMock([new BaseFeatureProviderMock(fresh)]);
        services.push(service);
        await service.initializePromise;
        await service.refresh();

        expect(service.cacheStorage).toBeInstanceOf(MemoryKeyValueStorage);
        expect(await service.cacheStorage?.getValue('ABExp.Features')).toEqual(fresh);
    });

    it.each([undefined, []])('returns empty data when providers are %j', async (providers) => {
        const service = createService(providers);
        await service.initializePromise;

        expect(await service.refresh()).toEqual(createFeatureData());
        expect(service.isFlightEnabled('unknown')).toBe(false);
        expect(service.getTreatmentVariable('missing', 'variant')).toBeUndefined();
        expect(telemetry.sharedProperties.get('assignmentContext')).toBe('');
    });

    it('loads and updates a custom cache key without touching other clients', async () => {
        storage.setValue('extension.cache', cached);
        storage.setValue('ABExp.Features', 'unrelated');
        const service = new ExperimentationServiceMock([new BaseFeatureProviderMock(fresh)], {
            telemetry,
            keyValueStorage: storage,
            storageKey: 'extension.cache',
        });
        services.push(service);
        await service.initializePromise;
        expect(storage.reads).toEqual(['extension.cache']);
        expect(service.getTreatmentVariable('vscode', 'variant')).toBe('control');

        await service.refresh();
        expect(await storage.getValue('extension.cache')).toEqual(fresh);
        expect(await storage.getValue('ABExp.Features')).toBe('unrelated');
    });

    it('waits for storage before answering a cached flight query', async () => {
        const cacheRead = new Deferred<void>();
        storage.setValue('ABExp.Features', cached);
        storage.readBarrier = cacheRead.promise;
        const service = createService();

        const enabled = service.isCachedFlightEnabled('cachedFlight');
        cacheRead.resolve();

        expect(await enabled).toBe(true);
        await service.initializePromise;
        expect(telemetry.eventsNamed('query-expfeature')[0].sharedProperties).toEqual(
            new Map([['assignmentContext', 'cached;']]),
        );
    });

    it('supports caches written before treatment configs were introduced', async () => {
        storage.setValue('ABExp.Features', {
            features: ['cachedFlight'],
            assignmentContext: 'legacy;',
        });
        const service = createService();
        await service.initializePromise;

        expect(service.isFlightEnabled('cachedFlight')).toBe(true);
        expect(service.getTreatmentVariable('vscode', 'variant')).toBeUndefined();
    });

    it('exposes storage read errors through initializePromise', async () => {
        const error = new Error('Storage unavailable');
        vi.spyOn(storage, 'getValue').mockRejectedValue(error);
        const service = createService();

        await expect(service.initializePromise).rejects.toBe(error);
    });

    it('propagates initialization errors from asynchronous lookups without issuing requests', async () => {
        const error = new Error('Storage unavailable');
        vi.spyOn(storage, 'getValue').mockRejectedValue(error);
        const provider = new BaseFeatureProviderMock(fresh);
        const service = createService([provider]);

        await Promise.all([
            expect(service.initializePromise).rejects.toBe(error),
            expect(service.isFlightEnabledAsync('freshFlight')).rejects.toBe(error),
            expect(service.getTreatmentVariableAsync('vscode', 'variant')).rejects.toBe(error),
            expect(service.getTreatmentVariableAsync('vscode', 'variant', true)).rejects.toBe(
                error,
            ),
        ]);
        expect(provider.fetch).not.toHaveBeenCalled();
    });

    it('initializes from cache independently of an in-flight initial request', async () => {
        const pending = new Deferred<FeatureData>();
        const provider = new BaseFeatureProviderMock();
        provider.fetch.mockReturnValueOnce(pending.promise);
        storage.setValue('ABExp.Features', cached);
        const service = createService([provider]);
        const request = service.refresh();
        const initiallyFetched = vi.fn();
        void service.initialFetch.then(initiallyFetched);

        await service.initializePromise;
        expect(service.getTreatmentVariable('vscode', 'variant')).toBe('control');
        expect(initiallyFetched).not.toHaveBeenCalled();

        pending.resolve(fresh);
        await request;
        await service.initialFetch;
        expect(initiallyFetched).toHaveBeenCalledTimes(1);
        expect(await storage.getValue('ABExp.Features')).toEqual(fresh);
        expect(service.getTreatmentVariable('vscode', 'variant')).toBe('control');
    });

    it('merges in provider order, not completion order, including falsy overrides', async () => {
        const first = new Deferred<FeatureData>();
        const second = new Deferred<FeatureData>();
        const legacy = new BaseFeatureProviderMock();
        const assignments = new BaseFeatureProviderMock();
        legacy.fetch.mockReturnValueOnce(first.promise);
        assignments.fetch.mockReturnValueOnce(second.promise);
        const service = createService([legacy, assignments]);
        await service.initializePromise;

        const request = service.refresh();
        expect(legacy.fetch).toHaveBeenCalledTimes(1);
        expect(assignments.fetch).toHaveBeenCalledTimes(1);
        second.resolve(
            createFeatureData({
                features: ['shared', 'new'],
                assignmentContext: 'new;',
                configs: [{ Id: 'vscode', Parameters: { enabled: false, rollout: 0, label: '' } }],
            }),
        );
        expect(storage.writes).toHaveLength(0);
        first.resolve(
            createFeatureData({
                features: ['legacy', 'shared'],
                assignmentContext: 'legacy',
                configs: [
                    {
                        Id: 'vscode',
                        Parameters: { enabled: true, rollout: 50, label: 'old', keep: 1 },
                    },
                    { Id: 'extension', Parameters: { enabled: true } },
                ],
            }),
        );

        const merged = await request;
        expect(merged).toEqual({
            features: ['legacy', 'shared', 'new'],
            assignmentContext: 'legacy;new;',
            configs: [
                { Id: 'vscode', Parameters: { enabled: false, rollout: 0, label: '', keep: 1 } },
                { Id: 'extension', Parameters: { enabled: true } },
            ],
        });
        expect(await storage.getValue('ABExp.Features')).toEqual(merged);
        expect(service.getTreatmentVariable('extension', 'enabled')).toBe(true);
        expect(service.getTreatmentVariable('vscode', 'enabled')).toBe(false);
    });

    it.each([
        ['legacy', 'new', 'legacy;new'],
        ['legacy;', 'new;', 'legacy;new;'],
        ['', 'new;', 'new;'],
        ['legacy;', '', 'legacy;'],
        ['', '', ''],
    ])(
        'joins assignment contexts %j and %j without losing segment boundaries',
        async (a, b, result) => {
            const service = createService([
                new BaseFeatureProviderMock(createFeatureData({ assignmentContext: a })),
                new BaseFeatureProviderMock(createFeatureData({ assignmentContext: b })),
            ]);
            await service.initializePromise;

            expect((await service.refresh()).assignmentContext).toBe(result);
            expect(telemetry.sharedProperties.get('assignmentContext')).toBe(result);
        },
    );

    it("does not mutate provider configs or retain another provider's overrides on retry", async () => {
        const original = structuredClone(cached);
        const legacy = new BaseFeatureProviderMock(cached);
        const assignments = new BaseFeatureProviderMock(fresh);
        const service = createService([legacy, assignments]);
        await service.initializePromise;
        await service.refresh();

        expect(service.getTreatmentVariable('vscode', 'variant')).toBe('treatment');
        expect(cached).toEqual(original);

        assignments.fetch.mockRejectedValueOnce(new Error('Assignments unavailable'));
        await service.refresh(true);
        expect(service.getTreatmentVariable('vscode', 'variant')).toBe('control');
        expect(cached).toEqual(original);
    });

    it('replaces rather than accumulates unconsumed features on later fetches', async () => {
        const provider = new BaseFeatureProviderMock();
        provider.fetch.mockResolvedValueOnce(cached).mockResolvedValueOnce(fresh);
        const service = createService([provider]);
        await service.initializePromise;
        await service.refresh();

        expect(await service.refresh()).toEqual(fresh);
        expect(service.isFlightEnabled('cachedFlight')).toBe(false);
        expect(service.getTreatmentVariable('vscode', 'enabled')).toBeUndefined();
        expect(telemetry.sharedProperties.get('assignmentContext')).toBe('fresh;');
    });

    it.each(['flight', 'cached flight', 'treatment'])(
        'pins session data after a %s lookup while persisting updates for the next session',
        async (lookup) => {
            storage.setValue('ABExp.Features', cached);
            const service = createService([new BaseFeatureProviderMock(fresh)]);
            await service.initializePromise;
            if (lookup === 'flight') {
                expect(service.isFlightEnabled('cachedFlight')).toBe(true);
            } else if (lookup === 'cached flight') {
                expect(await service.isCachedFlightEnabled('cachedFlight')).toBe(true);
            } else {
                expect(service.getTreatmentVariable('vscode', 'variant')).toBe('control');
            }

            await service.refresh();
            expect(service.getTreatmentVariable('vscode', 'variant')).toBe('control');
            expect(service.isFlightEnabled('freshFlight')).toBe(false);
            expect(telemetry.sharedProperties.get('assignmentContext')).toBe('cached;');
            expect(await storage.getValue('ABExp.Features')).toEqual(fresh);

            const nextSession = createService();
            await nextSession.initializePromise;
            expect(nextSession.getTreatmentVariable('vscode', 'variant')).toBe('treatment');
            expect(nextSession.isFlightEnabled('cachedFlight')).toBe(false);
        },
    );

    it('allows explicit asynchronous lookups to change already-consumed data', async () => {
        storage.setValue('ABExp.Features', cached);
        const service = createService([new BaseFeatureProviderMock(fresh)]);
        await service.initializePromise;
        expect(service.getTreatmentVariable('vscode', 'variant')).toBe('control');

        expect(await service.getTreatmentVariableAsync('vscode', 'variant')).toBe('treatment');
        expect(await service.isFlightEnabledAsync('freshFlight')).toBe(true);
        expect(service.isFlightEnabled('cachedFlight')).toBe(false);
        expect(telemetry.sharedProperties.get('assignmentContext')).toBe('fresh;');
    });

    it('keeps the explicitly refreshed snapshot stable during subsequent background updates', async () => {
        storage.setValue('ABExp.Features', cached);
        const provider = new BaseFeatureProviderMock(fresh);
        const service = createService([provider]);
        await service.initializePromise;
        expect(service.getTreatmentVariable('vscode', 'variant')).toBe('control');
        expect(await service.getTreatmentVariableAsync('vscode', 'variant')).toBe('treatment');

        const next = createFeatureData({
            assignmentContext: 'next;',
            configs: [{ Id: 'vscode', Parameters: { variant: 'next' } }],
        });
        provider.fetch.mockResolvedValueOnce(next);
        await service.refresh();

        expect(service.getTreatmentVariable('vscode', 'variant')).toBe('treatment');
        expect(telemetry.sharedProperties.get('assignmentContext')).toBe('fresh;');
        expect(await storage.getValue('ABExp.Features')).toEqual(next);
    });

    it('honors explicit refreshes that join an already-running background fetch', async () => {
        const pending = new Deferred<FeatureData>();
        const provider = new BaseFeatureProviderMock();
        provider.fetch.mockReturnValueOnce(pending.promise);
        const getFeatures = vi.spyOn(provider, 'getFeatures');
        storage.setValue('ABExp.Features', cached);
        const service = createService([provider]);
        await service.initializePromise;
        expect(service.getTreatmentVariable('vscode', 'variant')).toBe('control');

        const background = service.refresh();
        const variable = service.getTreatmentVariableAsync('vscode', 'variant');
        const flight = service.isFlightEnabledAsync('freshFlight');
        pending.resolve(fresh);
        await background;

        expect(await variable).toBe('treatment');
        expect(await flight).toBe(true);
        expect(getFeatures).toHaveBeenCalledTimes(1);
        expect(service.getTreatmentVariable('vscode', 'variant')).toBe('treatment');
        expect(telemetry.sharedProperties.get('assignmentContext')).toBe('fresh;');
    });

    it('coalesces concurrent refreshes and starts a new request after completion', async () => {
        const pending = new Deferred<FeatureData>();
        const provider = new BaseFeatureProviderMock();
        provider.fetch.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(fresh);
        const getFeatures = vi.spyOn(provider, 'getFeatures');
        const service = createService([provider]);
        await service.initializePromise;

        const requests = [service.refresh(), service.refresh(), service.refresh()];
        pending.resolve(cached);
        expect(await Promise.all(requests)).toEqual([cached, cached, cached]);
        expect(getFeatures).toHaveBeenCalledTimes(1);

        expect(await service.refresh()).toEqual(fresh);
        expect(getFeatures).toHaveBeenCalledTimes(2);
    });

    it.each([true, false])(
        'isolates a failed provider (failure first: %s)',
        async (failureFirst) => {
            const good = new BaseFeatureProviderMock(fresh);
            const bad = new BaseFeatureProviderMock();
            bad.fetch.mockRejectedValue(new Error('Endpoint unavailable'));
            const service = createService(failureFirst ? [bad, good] : [good, bad]);
            await service.initializePromise;

            expect(await service.refresh()).toEqual(fresh);
            await service.initialFetch;
            expect(await storage.getValue('ABExp.Features')).toEqual(fresh);
        },
    );

    it('preserves the cache when all providers fail, releases waiters, and retries', async () => {
        const pending = new Deferred<FeatureData>();
        const first = new BaseFeatureProviderMock();
        first.fetch.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(fresh);
        const second = new BaseFeatureProviderMock();
        second.fetch.mockRejectedValue(new Error('Other endpoint unavailable'));
        storage.setValue('ABExp.Features', cached);
        const service = createService([first, second]);
        await service.initializePromise;

        const requests = [service.refresh(), service.refresh()];
        pending.reject(new Error('Offline'));
        expect(await Promise.all(requests)).toEqual([cached, cached]);
        await service.initialFetch;
        expect(storage.writes).toHaveLength(1);
        expect(telemetry.sharedProperties.get('assignmentContext')).toBe('cached;');

        expect(await service.refresh()).toEqual(fresh);
        expect(first.fetch).toHaveBeenCalledTimes(2);
    });

    it('distinguishes a successful empty response from a failed request', async () => {
        storage.setValue('ABExp.Features', cached);
        const empty = createFeatureData();
        const service = createService([new BaseFeatureProviderMock(empty)]);
        await service.initializePromise;

        expect(await service.refresh()).toEqual(empty);
        await service.initialFetch;
        expect(await storage.getValue('ABExp.Features')).toEqual(empty);
        expect(service.isFlightEnabled('cachedFlight')).toBe(false);
    });

    it.each<{ name: string; configs: ConfigData[] }>([
        { name: 'empty assignments', configs: [] },
        { name: 'disabled flag', configs: [{ Id: 'vscode', Parameters: { enabled: false } }] },
        { name: 'zero rollout', configs: [{ Id: 'vscode', Parameters: { rollout: 0 } }] },
        { name: 'empty label', configs: [{ Id: 'vscode', Parameters: { label: '' } }] },
    ])('does not overwrite fetched $name with a slower stale cache read', async ({ configs }) => {
        const cacheRead = new Deferred<void>();
        storage.setValue('ABExp.Features', cached);
        storage.readBarrier = cacheRead.promise;
        const data = createFeatureData({ assignmentContext: 'fresh;', configs });
        const service = createService([new BaseFeatureProviderMock(data)]);

        expect(await service.refresh()).toEqual(data);
        cacheRead.resolve();
        await service.initializePromise;

        expect(service.isFlightEnabled('cachedFlight')).toBe(false);
        expect(service.getTreatmentVariable('vscode', 'variant')).toBeUndefined();
        expect(service.getTreatmentVariable('vscode', 'enabled')).toBe(
            configs[0]?.Parameters.enabled,
        );
        expect(telemetry.sharedProperties.get('assignmentContext')).toBe('fresh;');
    });

    it.each<[string, boolean | number | string]>([
        ['enabled', false],
        ['rollout', 0],
        ['label', ''],
        ['variant', 'control'],
    ])('returns cached %s without fetching, including falsy values', async (name, value) => {
        storage.setValue('ABExp.Features', cached);
        const provider = new BaseFeatureProviderMock(fresh);
        const service = createService([provider]);
        await service.initializePromise;

        expect(await service.getTreatmentVariableAsync('vscode', name, true)).toBe(value);
        expect(provider.fetch).not.toHaveBeenCalled();
    });

    it('waits for initialization when checking the treatment cache', async () => {
        const cacheRead = new Deferred<void>();
        storage.setValue('ABExp.Features', cached);
        storage.readBarrier = cacheRead.promise;
        const provider = new BaseFeatureProviderMock(fresh);
        const service = createService([provider]);

        const result = service.getTreatmentVariableAsync('vscode', 'variant', true);
        cacheRead.resolve();

        expect(await result).toBe('control');
        expect(provider.fetch).not.toHaveBeenCalled();
    });

    it('returns a cache hit during a background fetch without opting into its updated assignments', async () => {
        const pending = new Deferred<FeatureData>();
        const provider = new BaseFeatureProviderMock();
        provider.fetch.mockReturnValueOnce(pending.promise);
        storage.setValue('ABExp.Features', cached);
        const service = createService([provider]);
        await service.initializePromise;
        const background = service.refresh();

        expect(await service.getTreatmentVariableAsync('vscode', 'variant', true)).toBe('control');
        pending.resolve(fresh);
        await background;

        expect(provider.fetch).toHaveBeenCalledTimes(1);
        expect(service.getTreatmentVariable('vscode', 'variant')).toBe('control');
        expect(await storage.getValue('ABExp.Features')).toEqual(fresh);
        expect(
            telemetry.eventsNamed('query-expfeature')[0].sharedProperties.get('assignmentContext'),
        ).toBe('cached;');
    });

    it('logs cache-miss lookups only after the fetched assignment context is available', async () => {
        const service = createService([new BaseFeatureProviderMock(fresh)]);
        await service.initializePromise;

        expect(await service.getTreatmentVariableAsync('vscode', 'variant', true)).toBe(
            'treatment',
        );
        expect(telemetry.eventsNamed('query-expfeature')).toEqual([
            {
                eventName: 'query-expfeature',
                args: new Map([['ABExp.queriedFeature', 'vscode.variant']]),
                sharedProperties: new Map([['assignmentContext', 'fresh;']]),
            },
        ]);
    });

    it('fetches on a cache miss and returns undefined for unknown configs and variables', async () => {
        const provider = new BaseFeatureProviderMock(fresh);
        const service = createService([provider]);
        await service.initializePromise;

        expect(await service.getTreatmentVariableAsync('missing', 'variant', true)).toBeUndefined();
        expect(await service.getTreatmentVariableAsync('vscode', 'missing', true)).toBeUndefined();
        expect(provider.fetch).toHaveBeenCalledTimes(2);
    });

    it('deduplicates query telemetry across sync, cached, and async entry points', async () => {
        const service = createService([new BaseFeatureProviderMock(fresh)]);
        await service.initializePromise;
        await service.refresh();

        service.isFlightEnabled('freshFlight');
        await service.isCachedFlightEnabled('freshFlight');
        await service.isFlightEnabledAsync('freshFlight');
        service.getTreatmentVariable('vscode', 'variant');
        await service.getTreatmentVariableAsync('vscode', 'variant', true);
        service.getTreatmentVariable('extension', 'variant');

        expect(
            telemetry
                .eventsNamed('query-expfeature')
                .map((event) => event.args.get('ABExp.queriedFeature')),
        ).toEqual(['freshFlight', 'vscode.variant', 'extension.variant']);
    });
});
