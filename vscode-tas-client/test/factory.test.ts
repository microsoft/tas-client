/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Memento } from 'vscode';
import type { ExperimentationConfig } from '../src';
import {
    getExperimentationService,
    getExperimentationServiceAsync,
    getExperimentationServiceFromConfig,
    TargetPopulation,
    VSCodeAssignmentsFilterProvider,
} from '../src';
import { VSCodeFilterProvider } from '../src/vscode-tas-client/VSCodeFilterProvider';
import { MementoKeyValueStorage } from '../src/vscode-tas-client/MementoKeyValueStorage';
import TelemetryDisabledExperimentationService from '../src/vscode-tas-client/TelemetryDisabledExperimentationService';
import { Deferred } from './mocks/Deferred';
import { FakeExperimentationService } from './mocks/FakeExperimentationService';
import { FakeFilterProvider } from './mocks/FakeFilterProvider';
import { FakeMemento } from './mocks/FakeMemento';
import { FakeTelemetry } from './mocks/FakeTelemetry';
import { FakeTransport } from './mocks/FakeTransport';
import { fakeVSCode } from './mocks/FakeVSCode';

vi.mock('tas-client', async (importOriginal) => {
    const actual = await importOriginal<typeof import('tas-client')>();
    const { FakeExperimentationService } = await import('./mocks/FakeExperimentationService');
    return { ...actual, ExperimentationService: FakeExperimentationService };
});

describe('experimentation service factories', () => {
    let config: ExperimentationConfig;
    let memento: FakeMemento;
    let telemetry: FakeTelemetry;
    let transport: FakeTransport;

    beforeEach(() => {
        vi.useFakeTimers();
        FakeExperimentationService.reset();
        memento = new FakeMemento();
        telemetry = new FakeTelemetry();
        transport = new FakeTransport();
        config = {
            extensionName: 'publisher.extension',
            extensionVersion: '2.3.4',
            targetPopulation: TargetPopulation.Public,
            telemetry,
            memento,
        };
    });

    afterEach(() => {
        for (const service of FakeExperimentationService.instances) {
            service.dispose();
        }
        FakeExperimentationService.reset();
        expect(transport.unexpectedRequests).toEqual([]);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('wires the documented defaults and the caller-owned telemetry and storage', async () => {
        const service = getExperimentationServiceFromConfig(config);
        const [core] = FakeExperimentationService.instances;

        expect(service).toBe(core);
        expect(core.options).toEqual({
            filterProviders: [expect.any(VSCodeFilterProvider)],
            telemetry,
            storageKey: 'VSCode.ABExp.FeatureData',
            keyValueStorage: expect.any(MementoKeyValueStorage),
            featuresTelemetryPropertyName: '',
            assignmentContextTelemetryPropertyName: 'abexp.assignmentcontext',
            telemetryEventName: 'query-expfeature',
            endpoint: 'https://default.exp-tas.com/vscode/ab',
            extensionName: 'publisher.extension',
            fetch: undefined,
            assignmentsEndpoint: undefined,
            assignmentsFilterProviders: undefined,
            assignmentsFetch: undefined,
            refetchInterval: 30 * 60 * 1000,
        });
        expect(core.options.telemetry).toBe(telemetry);
        const storage = core.options.keyValueStorage!;
        storage.setValue('adapter-key', { enabled: true });
        await expect(storage.getValue('adapter-key')).resolves.toEqual({ enabled: true });
        expect(memento.writes).toEqual([{ key: 'adapter-key', value: { enabled: true } }]);
        expect(memento.reads).toEqual(['adapter-key']);
    });

    it('prepends generic filters and preserves caller ordering without mutating provider lists', () => {
        const first = new FakeFilterProvider({ 'X-Cohort': 'first' });
        const second = new FakeFilterProvider({ 'X-Cohort': 'last' });
        const assignments = new FakeFilterProvider({ custom_cohort: 'domain' });
        const legacyProviders = [first, second];
        const assignmentsProviders = [assignments];
        Object.freeze(legacyProviders);
        Object.freeze(assignmentsProviders);
        Object.freeze(config);

        getExperimentationServiceFromConfig({
            ...config,
            filterProviders: legacyProviders,
            assignmentsEndpoint: 'https://assignments.invalid/api/v1/assignments',
            assignmentsFilterProviders: assignmentsProviders,
        });
        const [core] = FakeExperimentationService.instances;

        expect(core.options.filterProviders).toEqual([
            expect.any(VSCodeFilterProvider),
            first,
            second,
        ]);
        expect(core.options.assignmentsFilterProviders).toEqual([
            expect.any(VSCodeAssignmentsFilterProvider),
            assignments,
        ]);
        expect(core.options.filterProviders).not.toBe(legacyProviders);
        expect(core.options.assignmentsFilterProviders).not.toBe(assignmentsProviders);
        expect(legacyProviders).toEqual([first, second]);
        expect(assignmentsProviders).toEqual([assignments]);
    });

    it('supplies generic assignments filters even when no domain-specific providers are supplied', () => {
        getExperimentationServiceFromConfig({
            ...config,
            assignmentsEndpoint: 'https://assignments.invalid/api/v1/assignments',
        });

        expect(FakeExperimentationService.instances[0].options.assignmentsFilterProviders).toEqual([
            expect.any(VSCodeAssignmentsFilterProvider),
        ]);
    });

    it.each([undefined, ''])(
        'does not install assignments filters without an active endpoint (%s)',
        (assignmentsEndpoint) => {
            const assignments = new FakeFilterProvider({ custom_cohort: 'unused' });
            getExperimentationServiceFromConfig({
                ...config,
                assignmentsEndpoint,
                assignmentsFilterProviders: [assignments],
                assignmentsFetch: transport.assignmentsFetch,
            });

            expect(
                FakeExperimentationService.instances[0].options.assignmentsFilterProviders,
            ).toBeUndefined();
            expect(assignments.callCount).toBe(0);
            expect(transport.requests).toEqual([]);
        },
    );

    it('forwards custom shared and per-endpoint transports unchanged', () => {
        const assignments = new FakeTransport();
        const endpoint = 'https://assignments.invalid/api/v1/assignments?scope=vscode';
        getExperimentationServiceFromConfig({
            ...config,
            fetch: transport.fetch,
            assignmentsEndpoint: endpoint,
            assignmentsFetch: assignments.assignmentsFetch,
        });
        const options = FakeExperimentationService.instances[0].options;

        expect(options.fetch).toBe(transport.fetch);
        expect(options.assignmentsFetch).toBe(assignments.assignmentsFetch);
        expect(options.assignmentsEndpoint).toBe(endpoint);
    });

    it('preserves positional factory arguments and variadic filter ordering', () => {
        const first = new FakeFilterProvider({ 'X-Cohort': 'first' });
        const second = new FakeFilterProvider({ 'X-Cohort': 'second' });
        const service = getExperimentationService(
            config.extensionName,
            config.extensionVersion,
            TargetPopulation.Team,
            telemetry,
            memento,
            first,
            second,
        );
        const [core] = FakeExperimentationService.instances;

        expect(service).toBe(core);
        expect(core.options.filterProviders).toEqual([
            expect.any(VSCodeFilterProvider),
            first,
            second,
        ]);
        expect(core.options.filterProviders![0].getFilters().get('X-VSCode-TargetPopulation')).toBe(
            'team',
        );
        expect(core.options.telemetry).toBe(telemetry);
    });

    it.each([
        { host: true, legacy: false, enabled: true },
        { host: false, legacy: true, enabled: false },
        { host: true, legacy: undefined, enabled: true },
        { host: false, legacy: undefined, enabled: false },
        { host: undefined, legacy: true, enabled: true },
        { host: undefined, legacy: false, enabled: false },
        { host: undefined, legacy: undefined, enabled: true },
    ])(
        'selects telemetry behavior with host=$host and legacy=$legacy',
        ({ host, legacy, enabled }) => {
            fakeVSCode.env.isTelemetryEnabled = host;
            fakeVSCode.telemetryConfiguration.enabled = legacy;

            const service = getExperimentationServiceFromConfig(config);

            expect(FakeExperimentationService.instances).toHaveLength(enabled ? 1 : 0);
            expect(service).toBeInstanceOf(
                enabled ? FakeExperimentationService : TelemetryDisabledExperimentationService,
            );
            expect(fakeVSCode.configurationRequests).toEqual(['telemetry']);
            expect(fakeVSCode.telemetryConfiguration.reads).toEqual(
                host === undefined ? [{ key: 'enableTelemetry', defaultValue: true }] : [],
            );
        },
    );

    it.each([null, undefined])(
        'rejects absent memento storage (%s), even when telemetry is disabled',
        (missing) => {
            fakeVSCode.env.isTelemetryEnabled = false;

            expect(() =>
                getExperimentationServiceFromConfig({
                    ...config,
                    memento: missing as unknown as Memento,
                }),
            ).toThrow('Memento storage was not provided.');
            expect(FakeExperimentationService.instances).toEqual([]);
            expect(fakeVSCode.configurationRequests).toEqual([]);
        },
    );

    it('provides the entire no-op API with no storage, telemetry, filters, transport or timers', async () => {
        fakeVSCode.env.isTelemetryEnabled = false;
        const filters = new FakeFilterProvider({ 'X-Cohort': 'unused' });
        const assignmentsFilters = new FakeFilterProvider({ cohort: 'unused' });
        const service = getExperimentationServiceFromConfig({
            ...config,
            fetch: transport.fetch,
            filterProviders: [filters],
            assignmentsEndpoint: 'https://assignments.invalid/api/v1/assignments',
            assignmentsFilterProviders: [assignmentsFilters],
            assignmentsFetch: transport.assignmentsFetch,
        });

        await expect(service.initializePromise).resolves.toBeUndefined();
        await expect(service.initialFetch).resolves.toBeUndefined();
        expect(service.isFlightEnabled('enabled')).toBe(false);
        await expect(service.isCachedFlightEnabled('enabled')).resolves.toBe(false);
        await expect(service.isFlightEnabledAsync('enabled')).resolves.toBe(false);
        expect(service.getTreatmentVariable('vscode', 'treatment')).toBeUndefined();
        await expect(
            service.getTreatmentVariableAsync('vscode', 'treatment'),
        ).resolves.toBeUndefined();
        await expect(
            service.getTreatmentVariableAsync('vscode', 'treatment', true),
        ).resolves.toBeUndefined();
        expect(() => {
            service.dispose();
            service.dispose();
        }).not.toThrow();

        expect(FakeExperimentationService.instances).toEqual([]);
        expect(memento.reads).toEqual([]);
        expect(memento.writes).toEqual([]);
        expect(telemetry.events).toEqual([]);
        expect(telemetry.sharedPropertyWrites).toEqual([]);
        expect(filters.callCount).toBe(0);
        expect(assignmentsFilters.callCount).toBe(0);
        expect(transport.requests).toEqual([]);
    });

    it('creates independent services and reevaluates telemetry for each call', () => {
        const first = getExperimentationServiceFromConfig(config);
        fakeVSCode.env.isTelemetryEnabled = false;
        const disabled = getExperimentationServiceFromConfig(config);
        fakeVSCode.env.isTelemetryEnabled = true;
        const second = getExperimentationServiceFromConfig(config);

        expect(first).not.toBe(second);
        expect(disabled).toBeInstanceOf(TelemetryDisabledExperimentationService);
        expect(FakeExperimentationService.instances).toHaveLength(2);
    });

    it('returns immediately from the synchronous factory before initialization completes', async () => {
        const initialization = new Deferred<void>();
        FakeExperimentationService.nextInitialization = initialization.promise;

        const service = getExperimentationServiceFromConfig(config);

        expect(service.initializePromise).toBe(initialization.promise);
        initialization.resolve(undefined);
        await service.initializePromise;
    });

    it('waits for initialization, but not fetching, in the asynchronous positional factory', async () => {
        const initialization = new Deferred<void>();
        const fetch = new Deferred<void>();
        FakeExperimentationService.nextInitialization = initialization.promise;
        FakeExperimentationService.nextInitialFetch = fetch.promise;
        const filters = new FakeFilterProvider({ 'X-Cohort': 'custom' });
        let resolved = false;
        const result = getExperimentationServiceAsync(
            config.extensionName,
            config.extensionVersion,
            config.targetPopulation,
            telemetry,
            memento,
            filters,
        ).then((service) => {
            resolved = true;
            return service;
        });

        await Promise.resolve();
        expect(resolved).toBe(false);
        expect(FakeExperimentationService.instances).toHaveLength(1);
        initialization.resolve(undefined);

        await expect(result).resolves.toBe(FakeExperimentationService.instances[0]);
        expect(FakeExperimentationService.instances[0].options.filterProviders).toEqual([
            expect.any(VSCodeFilterProvider),
            filters,
        ]);
        expect(FakeExperimentationService.instances[0].initialFetch).toBe(fetch.promise);
        fetch.resolve(undefined);
        await fetch.promise;
    });

    it('propagates initialization rejection from the asynchronous factory', async () => {
        const initialization = new Deferred<void>();
        FakeExperimentationService.nextInitialization = initialization.promise;
        const error = new Error('Cannot initialize cached experiments');
        const result = getExperimentationServiceAsync(
            config.extensionName,
            config.extensionVersion,
            config.targetPopulation,
            telemetry,
            memento,
        );
        const assertion = expect(result).rejects.toBe(error);

        initialization.reject(error);

        await assertion;
    });

    it('resolves the asynchronous factory while telemetry is disabled', async () => {
        fakeVSCode.env.isTelemetryEnabled = false;

        const service = await getExperimentationServiceAsync(
            config.extensionName,
            config.extensionVersion,
            config.targetPopulation,
            telemetry,
            memento,
        );

        expect(service).toBeInstanceOf(TelemetryDisabledExperimentationService);
        expect(FakeExperimentationService.instances).toEqual([]);
    });
});
