/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExperimentationConfig, IExperimentationService } from '../src';
import { getExperimentationServiceFromConfig, TargetPopulation } from '../src';
import { ExperimentationService as WorkingTreeExperimentationService } from '../../tas-client/src/index';
import { FakeFilterProvider } from './mocks/FakeFilterProvider';
import { FakeMemento } from './mocks/FakeMemento';
import { FakeTelemetry } from './mocks/FakeTelemetry';
import { FakeResponse, FakeTransport } from './mocks/FakeTransport';
import { fakeVSCode } from './mocks/FakeVSCode';
import { assignmentsResponse, cachedFeatures, legacyResponse } from './mocks/responses';

const legacyEndpoint = 'https://default.exp-tas.com/vscode/ab';
const assignmentsEndpoint = 'https://assignments.invalid/api/v1/assignments';
const storageKey = 'VSCode.ABExp.FeatureData';
const refreshInterval = 30 * 60 * 1000;

describe('VS Code adapter with the real TAS client', () => {
    let memento: FakeMemento;
    let telemetry: FakeTelemetry;
    let transport: FakeTransport;
    let services: IExperimentationService[];
    let transports: FakeTransport[];

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
        memento = new FakeMemento();
        telemetry = new FakeTelemetry();
        transport = new FakeTransport();
        transports = [transport];
        services = [];
    });

    afterEach(() => {
        for (const service of services) {
            service.dispose();
        }
        expect(vi.getTimerCount()).toBe(0);
        for (const fake of transports) {
            expect(fake.unexpectedRequests).toEqual([]);
            expect(fake.pendingResponseCount).toBe(0);
        }
    });

    function createService(
        overrides: Partial<ExperimentationConfig> = {},
    ): IExperimentationService {
        const service = getExperimentationServiceFromConfig({
            extensionName: 'publisher.extension',
            extensionVersion: '2.3.4-rc.1+build.123',
            targetPopulation: TargetPopulation.Internal,
            telemetry,
            memento,
            fetch: transport.fetch,
            ...overrides,
        });
        services.push(service);
        return service;
    }

    it('sends legacy host metadata and custom filters, persists responses and attributes telemetry', async () => {
        fakeVSCode.version = '1.95.0-insider';
        fakeVSCode.env.appName = 'Visual Studio Code - Insiders';
        fakeVSCode.env.machineId = 'stable-machine-id';
        fakeVSCode.env.language = 'fr';
        const filters = new FakeFilterProvider({
            'X-Extension-Cohort': 'canary',
            'X-VSCode-TargetPopulation': 'team',
        });
        const unusedAssignmentsFilters = new FakeFilterProvider({ cohort: 'unused' });
        transport.respondWith(
            legacyEndpoint,
            'GET',
            legacyResponse({ mode: 'control', enabled: true }, 'legacy:control;'),
        );

        const service = createService({
            filterProviders: [filters],
            assignmentsFilterProviders: [unusedAssignmentsFilters],
            assignmentsFetch: transport.assignmentsFetch,
        });
        await Promise.all([service.initializePromise, service.initialFetch]);

        expect(service).toBeInstanceOf(WorkingTreeExperimentationService);
        expect(transport.requests).toEqual([
            {
                url: legacyEndpoint,
                init: {
                    method: 'GET',
                    headers: {
                        'X-MSEdge-Market': '',
                        'X-FD-Corpnet': '',
                        'X-VSCode-AppVersion': '1.95.0',
                        'X-VSCode-Build': 'Visual Studio Code - Insiders',
                        'X-MSEdge-ClientId': 'stable-machine-id',
                        'X-VSCode-ExtensionName': 'publisher.extension',
                        'X-VSCode-ExtensionVersion': '2.3.4',
                        'X-VSCode-Language': 'fr',
                        'X-VSCode-TargetPopulation': 'team',
                        'X-Extension-Cohort': 'canary',
                    },
                },
            },
        ]);
        expect(filters.callCount).toBe(1);
        expect(unusedAssignmentsFilters.callCount).toBe(0);
        expect(service.getTreatmentVariable('vscode', 'mode')).toBe('control');
        expect(service.getTreatmentVariable('vscode', 'mode')).toBe('control');
        expect(memento.writes).toEqual([
            {
                key: storageKey,
                value: cachedFeatures({ mode: 'control', enabled: true }, 'legacy:control;'),
            },
        ]);
        expect(telemetry.sharedProperties.get('abexp.assignmentcontext')).toBe('legacy:control;');
        expect(telemetry.sharedProperties.has('vscode.abexp.features')).toBe(false);
        expect(telemetry.eventsNamed('tas-call')).toEqual([
            {
                name: 'tas-call',
                properties: new Map([
                    ['callType', 'legacy'],
                    ['outcome', 'Success'],
                    ['extensionName', 'publisher.extension'],
                    ['assignmentContext', 'legacy:control;'],
                ]),
            },
        ]);
        expect(telemetry.eventsNamed('query-expfeature')).toEqual([
            {
                name: 'query-expfeature',
                properties: new Map([['ABExp.queriedFeature', 'vscode.mode']]),
            },
        ]);
    });

    it('uses the shared transport for both endpoints with separate filters and merged treatments', async () => {
        const legacyFilters = new FakeFilterProvider({ 'X-Legacy-Cohort': 'legacy-only' });
        const assignmentsFilters = new FakeFilterProvider({
            extensionname: 'domain-override',
            custom_cohort: 'assignments-only',
        });
        transport.respondWith(
            legacyEndpoint,
            'GET',
            legacyResponse({ mode: 'legacy', legacyOnly: true }, 'legacy:1;'),
        );
        transport.respondWith(
            assignmentsEndpoint,
            'POST',
            assignmentsResponse(
                { '/vscode/mode': 'treatment', '/vscode/limit': '7' },
                'assignments:2;',
            ),
        );
        const service = createService({
            assignmentsEndpoint,
            filterProviders: [legacyFilters],
            assignmentsFilterProviders: [assignmentsFilters],
        });

        await Promise.all([service.initializePromise, service.initialFetch]);

        expect(transport.requests).toHaveLength(2);
        const legacy = transport.requests.find((request) => request.init.method === 'GET')!;
        const assignments = transport.requests.find((request) => request.init.method === 'POST')!;
        expect(legacy.url).toBe(legacyEndpoint);
        expect(legacy.init.headers['X-Legacy-Cohort']).toBe('legacy-only');
        expect(legacy.init.headers).not.toHaveProperty('custom_cohort');
        expect(assignments.url).toBe(assignmentsEndpoint);
        expect(assignments.init.headers).toEqual({ 'Content-Type': 'application/json' });
        expect(JSON.parse(assignments.init.body!)).toEqual({
            userParams: {
                vscode_core_appversion: '1.85.0',
                vscode_core_build: 'Visual Studio Code',
                vscode_core_extensionname: 'publisher.extension',
                extensionname: 'domain-override',
                vscode_core_targetpopulation: 'internal',
                custom_cohort: 'assignments-only',
            },
        });
        expect(service.getTreatmentVariable('vscode', 'mode')).toBe('treatment');
        expect(service.getTreatmentVariable('vscode', 'legacyOnly')).toBe(true);
        expect(service.getTreatmentVariable('vscode', 'limit')).toBe(7);
        expect(telemetry.sharedProperties.get('abexp.assignmentcontext')).toBe(
            'legacy:1;assignments:2;',
        );
        expect(
            telemetry.eventsNamed('tas-call').map((event) => Object.fromEntries(event.properties)),
        ).toEqual(
            expect.arrayContaining([
                {
                    callType: 'legacy',
                    outcome: 'Success',
                    extensionName: 'publisher.extension',
                    assignmentContext: 'legacy:1;',
                },
                {
                    callType: 'assignments',
                    outcome: 'Success',
                    extensionName: 'publisher.extension',
                    assignmentContext: 'assignments:2;',
                },
            ]),
        );
        expect(memento.writes).toHaveLength(1);
        expect(memento.writes[0]).toMatchObject({
            key: storageKey,
            value: {
                configs: [
                    { Id: 'vscode', Parameters: { mode: 'treatment', legacyOnly: true, limit: 7 } },
                ],
            },
        });
    });

    it('gives the assignments-only transport precedence over the shared transport', async () => {
        const assignmentsTransport = new FakeTransport();
        transports.push(assignmentsTransport);
        transport.respondWith(legacyEndpoint, 'GET', legacyResponse({ mode: 'legacy' }));
        assignmentsTransport.respondWith(
            assignmentsEndpoint,
            'POST',
            assignmentsResponse({ '/vscode/mode': 'assignments' }),
        );
        const service = createService({
            assignmentsEndpoint,
            assignmentsFetch: assignmentsTransport.assignmentsFetch,
        });

        await service.initialFetch;

        expect(transport.requests.map((request) => request.init.method)).toEqual(['GET']);
        expect(assignmentsTransport.requests.map((request) => request.init.method)).toEqual([
            'POST',
        ]);
        expect(assignmentsTransport.requests[0].url).toBe(assignmentsEndpoint);
        expect(service.getTreatmentVariable('vscode', 'mode')).toBe('assignments');
    });

    it('returns cached treatments during a slow startup and saves fresh data for the next session', async () => {
        memento = new FakeMemento({
            [storageKey]: cachedFeatures({ mode: 'cached' }, 'cached:1;'),
        });
        const firstResponse = transport.defer(legacyEndpoint, 'GET');
        const first = createService();

        await first.initializePromise;

        expect(transport.requests).toHaveLength(1);
        expect(first.getTreatmentVariable('vscode', 'mode')).toBe('cached');
        expect(telemetry.sharedProperties.get('abexp.assignmentcontext')).toBe('cached:1;');
        firstResponse.resolve(new FakeResponse(legacyResponse({ mode: 'fresh' }, 'fresh:2;')));
        await first.initialFetch;

        expect(first.getTreatmentVariable('vscode', 'mode')).toBe('cached');
        expect(telemetry.sharedProperties.get('abexp.assignmentcontext')).toBe('cached:1;');
        expect(memento.get(storageKey)).toEqual(cachedFeatures({ mode: 'fresh' }, 'fresh:2;'));

        first.dispose();
        const secondResponse = transport.defer(legacyEndpoint, 'GET');
        const second = createService();
        await second.initializePromise;

        expect(second).not.toBe(first);
        expect(second.getTreatmentVariable('vscode', 'mode')).toBe('fresh');
        expect(telemetry.sharedProperties.get('abexp.assignmentcontext')).toBe('fresh:2;');
        secondResponse.resolve(new FakeResponse(legacyResponse({ mode: 'fresh' }, 'fresh:2;')));
        await second.initialFetch;
    });

    it('uses freshly fetched treatments if cached values have not been consumed', async () => {
        memento = new FakeMemento({ [storageKey]: cachedFeatures({ mode: 'old' }) });
        const response = transport.defer(legacyEndpoint, 'GET');
        const service = createService();
        await service.initializePromise;

        response.resolve(new FakeResponse(legacyResponse({ mode: 'fresh' }, 'fresh:1;')));
        await service.initialFetch;

        expect(service.getTreatmentVariable('vscode', 'mode')).toBe('fresh');
        expect(telemetry.sharedProperties.get('abexp.assignmentcontext')).toBe('fresh:1;');
    });

    it('uses safe defaults for an empty cache before the first response', async () => {
        const response = transport.defer(legacyEndpoint, 'GET');
        const service = createService();

        await service.initializePromise;

        expect(service.getTreatmentVariable('vscode', 'missing')).toBeUndefined();
        expect(service.getTreatmentVariable('missing-config', 'missing')).toBeUndefined();
        expect(service.isFlightEnabled('missing')).toBe(false);
        await expect(service.isCachedFlightEnabled('missing')).resolves.toBe(false);
        expect(memento.reads).toEqual([storageKey]);
        response.resolve(new FakeResponse(legacyResponse({})));
        await service.initialFetch;
    });

    it.each([false, 0, ''])(
        'does not refetch an existing cached treatment whose value is %j',
        async (value) => {
            memento = new FakeMemento({ [storageKey]: cachedFeatures({ value }) });
            const response = transport.defer(legacyEndpoint, 'GET');
            const service = createService();
            await service.initializePromise;

            await expect(service.getTreatmentVariableAsync('vscode', 'value', true)).resolves.toBe(
                value,
            );
            expect(transport.requests).toHaveLength(1);

            response.resolve(new FakeResponse(legacyResponse({ value })));
            await service.initialFetch;
        },
    );

    it('explicitly refreshes consumed treatments and updates the persistent cache', async () => {
        transport.respondWith(legacyEndpoint, 'GET', legacyResponse({ mode: 'old' }, 'old:1;'));
        const service = createService();
        await service.initialFetch;
        expect(service.getTreatmentVariable('vscode', 'mode')).toBe('old');
        transport.respondWith(legacyEndpoint, 'GET', legacyResponse({ mode: 'new' }, 'new:2;'));

        await expect(service.getTreatmentVariableAsync('vscode', 'mode')).resolves.toBe('new');

        expect(transport.requests).toHaveLength(2);
        expect(service.getTreatmentVariable('vscode', 'mode')).toBe('new');
        expect(memento.get(storageKey)).toEqual(cachedFeatures({ mode: 'new' }, 'new:2;'));
        expect(telemetry.sharedProperties.get('abexp.assignmentcontext')).toBe('new:2;');
        expect(telemetry.eventsNamed('query-expfeature')).toHaveLength(1);
        expect(vi.getTimerCount()).toBe(1);
    });

    it('refreshes after exactly thirty minutes and stops polling when disposed', async () => {
        transport.respondWith(legacyEndpoint, 'GET', legacyResponse({ mode: 'old' }));
        const service = createService();
        await service.initialFetch;
        expect(service.getTreatmentVariable('vscode', 'mode')).toBe('old');
        transport.respondWith(legacyEndpoint, 'GET', legacyResponse({ mode: 'new' }, 'new:1;'));

        await vi.advanceTimersByTimeAsync(refreshInterval - 1);
        expect(transport.requests).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(1);

        expect(transport.requests).toHaveLength(2);
        expect(service.getTreatmentVariable('vscode', 'mode')).toBe('old');
        expect(memento.get(storageKey)).toEqual(cachedFeatures({ mode: 'new' }, 'new:1;'));
        service.dispose();
        service.dispose();
        await vi.advanceTimersByTimeAsync(refreshInterval * 2);

        expect(transport.requests).toHaveLength(2);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('keeps persisted treatments usable when the initial transport fails offline', async () => {
        memento = new FakeMemento({
            [storageKey]: cachedFeatures({ mode: 'offline-cache' }, 'cached:1;'),
        });
        transport.rejectWith(legacyEndpoint, 'GET', new Error('Offline'));
        const service = createService();

        await Promise.all([service.initializePromise, service.initialFetch]);

        expect(service.getTreatmentVariable('vscode', 'mode')).toBe('offline-cache');
        expect(memento.writes).toEqual([]);
        expect(telemetry.sharedProperties.get('abexp.assignmentcontext')).toBe('cached:1;');
        expect(telemetry.eventsNamed('call-tas-error')).toHaveLength(1);
        expect(telemetry.eventsNamed('tas-call')[0].properties.get('outcome')).toBe('GenericError');
    });

    it('does not start the real client or touch cached experiments when telemetry is disabled', async () => {
        fakeVSCode.env.isTelemetryEnabled = false;
        memento = new FakeMemento({ [storageKey]: cachedFeatures({ enabled: true }) });
        const service = createService({ assignmentsEndpoint });

        await Promise.all([service.initializePromise, service.initialFetch]);
        expect(service.getTreatmentVariable('vscode', 'enabled')).toBeUndefined();
        await expect(
            service.getTreatmentVariableAsync('vscode', 'enabled'),
        ).resolves.toBeUndefined();
        expect(service.isFlightEnabled('enabled')).toBe(false);
        await expect(service.isCachedFlightEnabled('enabled')).resolves.toBe(false);
        await expect(service.isFlightEnabledAsync('enabled')).resolves.toBe(false);

        expect(memento.reads).toEqual([]);
        expect(memento.writes).toEqual([]);
        expect(transport.requests).toEqual([]);
        expect(telemetry.events).toEqual([]);
        expect(telemetry.sharedPropertyWrites).toEqual([]);
        expect(vi.getTimerCount()).toBe(0);
    });
});
