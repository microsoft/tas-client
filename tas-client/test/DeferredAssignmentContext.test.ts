/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExperimentationServiceConfig } from '../src/contracts/ExperimentationServiceConfig.js';
import { ExperimentationService } from '../src/tas-client/ExperimentationService.js';
import { ExperimentationTelemetryMock } from './mocks/ExperimentationTelemetryMock.js';
import { KeyValueStorageMock } from './mocks/KeyValueStorageMock.js';

class TestExperimentationService extends ExperimentationService {
    async refreshInBackground(): Promise<void> {
        await this.getFeaturesAsync();
    }
}

describe('Deferred assignment context', () => {
    const clients: ExperimentationService[] = [];
    const deferred = [{ configId: 'vscode', name: 'blueButton' }];
    const response = (
        variant = 'blue-button-control',
        allocation = 12345,
        value: boolean | string | number = false,
    ) => ({
        Configs: [
            { Id: 'vscode', Parameters: { blueButton: value, 'blueButton.contextId': variant } },
        ],
        AssignmentContext: `eager:1;${variant}:${allocation};${variant}-extra:3;`,
    });

    function createClient(options: Partial<ExperimentationServiceConfig> = {}) {
        const telemetry = new ExperimentationTelemetryMock();
        const storage = new KeyValueStorageMock();
        const published = vi.spyOn(telemetry, 'setSharedProperty');
        const service = new TestExperimentationService({
            endpoint: 'https://example.test/tas',
            telemetry,
            keyValueStorage: storage,
            storageKey: 'features',
            assignmentContextTelemetryPropertyName: 'context',
            telemetryEventName: 'query',
            deferredAssignmentContexts: deferred,
            fetch: async () => ({ status: 200, json: async () => response() }),
            ...options,
        });
        clients.push(service);
        return { service, telemetry, storage, published };
    }

    function read(service: ExperimentationService) {
        return service.getTreatmentVariableWithExposure('vscode', 'blueButton');
    }

    afterEach(() => {
        for (const client of clients.splice(0)) {
            client.dispose();
        }
        vi.restoreAllMocks();
    });

    it('preserves eager publication for experiments that do not opt in', async () => {
        const { service, telemetry } = createClient({ deferredAssignmentContexts: undefined });
        await service.initialFetch;
        expect({
            value: service.getTreatmentVariable('vscode', 'blueButton'),
            context: telemetry.sharedProperties.get('context'),
        }).toEqual({ value: false, context: response().AssignmentContext });
    });

    it('snapshots the startup configuration', async () => {
        const configuration = [{ configId: 'vscode', name: 'blueButton' }];
        const { service, telemetry } = createClient({ deferredAssignmentContexts: configuration });
        configuration[0].name = 'changed';
        configuration.push({ configId: 'vscode', name: 'later' });
        await service.initialFetch;
        const before = telemetry.sharedProperties.get('context');
        read(service).release();
        expect({ before, after: telemetry.sharedProperties.get('context') }).toEqual({
            before: 'eager:1;blue-button-control-extra:3;',
            after: response().AssignmentContext,
        });
    });

    it('uses the same startup snapshot to preserve assignments-API companion strings', async () => {
        const configuration = [{ configId: 'vscode', name: 'blueButton' }];
        const { service } = createClient({
            deferredAssignmentContexts: configuration,
            assignmentsEndpoint: 'https://example.test/assignments',
            assignmentsFilterProviders: [{ getFilters: () => new Map([['id', 'test']]) }],
            fetch: async (_url, init) => ({
                status: 200,
                json: async () =>
                    init.method === 'GET'
                        ? response()
                        : {
                              featureVariables: {
                                  blueButton: 'true',
                                  'blueButton.contextId': '123',
                              },
                              assignedVariants: [],
                              dataVersion: 1,
                              assignmentContext: '123:99999',
                          },
            }),
        });
        configuration[0].name = 'changed';
        await service.initialFetch;
        const treatment = read(service);
        expect({
            value: treatment.value,
            contextId: treatment.contextId,
            released: treatment.release(),
        }).toEqual({
            value: true,
            contextId: '123',
            released: true,
        });
    });

    it.each([true, false, 'blue', '', 0, 42])(
        'binds release to the feature value %s',
        async (value) => {
            const { service, telemetry } = createClient({
                fetch: async () => ({ status: 200, json: async () => response('arm', 456, value) }),
            });
            await service.initialFetch;
            const treatment = await service.getTreatmentVariableWithExposureAsync(
                'vscode',
                'blueButton',
                true,
            );
            const before = telemetry.sharedProperties.get('context');
            const queryBefore = telemetry.postedEvents.at(-1)?.sharedProperties.get('context');
            const legacyValue = service.getTreatmentVariable('vscode', 'blueButton');
            const released = treatment.release();
            telemetry.postEvent('impression', new Map());
            expect({
                value: treatment.value,
                legacyValue,
                contextId: treatment.contextId,
                before,
                queryBefore,
                released,
                impression: telemetry.postedEvents.at(-1)?.sharedProperties.get('context'),
            }).toEqual({
                value,
                legacyValue: value,
                contextId: 'arm',
                before: 'eager:1;arm-extra:3;',
                queryBefore: 'eager:1;arm-extra:3;',
                released: true,
                impression: 'eager:1;arm:456;arm-extra:3;',
            });
        },
    );

    it('does not publish or persist again on repeated release', async () => {
        const { service, storage, published } = createClient();
        await service.initialFetch;
        const treatment = read(service);
        treatment.release();
        const writes = vi.spyOn(storage, 'setValue');
        published.mockClear();
        expect({
            released: treatment.release(),
            publications: published.mock.calls,
            writes: writes.mock.calls,
        }).toEqual({ released: true, publications: [], writes: [] });
    });

    it('initializes an async treatment read without publishing its assignment', async () => {
        const { service, telemetry } = createClient();
        const treatment = await service.getTreatmentVariableWithExposureAsync<boolean>(
            'vscode',
            'blueButton',
            true,
        );
        expect({
            value: treatment.value,
            context: telemetry.sharedProperties.get('context'),
            exposed: telemetry.postedEvents.some(
                (event) =>
                    event.sharedProperties
                        .get('context')
                        ?.split(';')
                        .includes('blue-button-control:12345'),
            ),
        }).toEqual({
            value: false,
            context: 'eager:1;blue-button-control-extra:3;',
            exposed: false,
        });
    });

    it('releases configured flags independently, including identical names in different configs', async () => {
        const { service, telemetry } = createClient({
            deferredAssignmentContexts: [...deferred, { configId: 'other', name: 'blueButton' }],
            fetch: async () => ({
                status: 200,
                json: async () => ({
                    Configs: [
                        ...response().Configs,
                        {
                            Id: 'other',
                            Parameters: { blueButton: 'red', 'blueButton.contextId': 'other-arm' },
                        },
                    ],
                    AssignmentContext: 'eager:1;blue-button-control:12345;other-arm:67890;',
                }),
            }),
        });
        await service.initialFetch;
        const before = telemetry.sharedProperties.get('context');
        read(service).release();
        const first = telemetry.sharedProperties.get('context');
        service.getTreatmentVariableWithExposure('other', 'blueButton').release();
        expect({ before, first, both: telemetry.sharedProperties.get('context') }).toEqual({
            before: 'eager:1;',
            first: 'eager:1;blue-button-control:12345;',
            both: 'eager:1;blue-button-control:12345;other-arm:67890;',
        });
    });

    it.each([false, true])(
        'restores cached exposure before publishing (released: %s)',
        async (released) => {
            const first = createClient();
            await first.service.initialFetch;
            if (released) {
                read(first.service).release();
            }
            const next = createClient({ keyValueStorage: first.storage });
            await next.service.initialFetch;
            const expected = released
                ? response().AssignmentContext
                : 'eager:1;blue-button-control-extra:3;';
            expect(next.published.mock.calls.map(([, value]) => value)).toEqual([
                expected,
                expected,
            ]);
        },
    );

    it.each([
        ['blue-button-control', 99999],
        ['different-arm', 12345],
    ])(
        'does not release a later assignment %s:%s using an old response',
        async (variant, allocation) => {
            let data = response();
            const { service, telemetry, storage } = createClient({
                fetch: async () => ({ status: 200, json: async () => data }),
            });
            await service.initialFetch;
            const old = read(service);
            data = response(variant, allocation, true);
            const current = await service.getTreatmentVariableWithExposureAsync(
                'vscode',
                'blueButton',
                false,
            );
            const oldReleased = old.release();
            const before = telemetry.sharedProperties.get('context');
            const restarted = createClient({ keyValueStorage: storage });
            await restarted.service.initializePromise;
            const afterRestart = restarted.telemetry.sharedProperties.get('context');
            current.release();
            expect({
                oldValue: old.value,
                currentValue: current.value,
                oldReleased,
                before,
                afterRestart,
                after: telemetry.sharedProperties.get('context'),
            }).toEqual({
                oldValue: false,
                currentValue: true,
                oldReleased: false,
                before: `eager:1;${variant}-extra:3;`,
                afterRestart: `eager:1;${variant}-extra:3;`,
                after: data.AssignmentContext,
            });
        },
    );

    it('does not transfer a persisted release to a new allocation', async () => {
        const first = createClient();
        await first.service.initialFetch;
        read(first.service).release();
        const next = createClient({
            keyValueStorage: first.storage,
            fetch: async () => ({
                status: 200,
                json: async () => response('blue-button-control', 54321),
            }),
        });
        await next.service.initialFetch;
        const before = next.telemetry.sharedProperties.get('context');
        read(next.service).release();
        expect({ before, after: next.telemetry.sharedProperties.get('context') }).toEqual({
            before: 'eager:1;blue-button-control-extra:3;',
            after: response('blue-button-control', 54321).AssignmentContext,
        });
    });

    it.each(['new-arm', '123', 'false'])(
        'preserves companion metadata and provider provenance for %s',
        async (variant) => {
            const { service, telemetry, storage } = createClient({
                assignmentsEndpoint: 'https://example.test/assignments',
                assignmentsFilterProviders: [{ getFilters: () => new Map([['id', 'test']]) }],
                fetch: async (_url, init) => ({
                    status: 200,
                    json: async () =>
                        init.method === 'GET'
                            ? response()
                            : {
                                  featureVariables: {
                                      '/vscode/blueButton': 'true',
                                      '/vscode/blueButton.contextId': variant,
                                  },
                                  assignedVariants: [],
                                  dataVersion: 1,
                                  assignmentContext: `${variant}:10;new-eager:20`,
                              },
                }),
            });
            await service.initialFetch;
            const treatment = read(service);
            const before = telemetry.sharedProperties.get('context');
            treatment.release();
            const next = createClient({ keyValueStorage: storage });
            await next.service.initializePromise;
            expect({
                value: treatment.value,
                contextId: treatment.contextId,
                before,
                after: telemetry.sharedProperties.get('context'),
                afterRestart: next.telemetry.sharedProperties.get('context'),
            }).toEqual({
                value: true,
                contextId: variant,
                before: 'eager:1;blue-button-control-extra:3;new-eager:20',
                after: `eager:1;blue-button-control-extra:3;${variant}:10;new-eager:20`,
                afterRestart: `eager:1;blue-button-control-extra:3;${variant}:10;new-eager:20`,
            });
        },
    );

    it('does not release a shadowed provider allocation with the same variant name', async () => {
        const { service, telemetry } = createClient({
            assignmentsEndpoint: 'https://example.test/assignments',
            assignmentsFilterProviders: [{ getFilters: () => new Map([['id', 'test']]) }],
            fetch: async (_url, init) => ({
                status: 200,
                json: async () =>
                    init.method === 'GET'
                        ? response()
                        : {
                              featureVariables: {
                                  blueButton: 'true',
                                  'blueButton.contextId': 'blue-button-control',
                              },
                              assignedVariants: [],
                              dataVersion: 1,
                              assignmentContext: 'blue-button-control:99999',
                          },
            }),
        });
        await service.initialFetch;
        read(service).release();
        expect(telemetry.sharedProperties.get('context')).toBe(
            'eager:1;blue-button-control-extra:3;blue-button-control:99999',
        );
    });

    it('rejects a provider value missing its own companion instead of borrowing another providers metadata', async () => {
        const { service, telemetry } = createClient({
            assignmentsEndpoint: 'https://example.test/assignments',
            assignmentsFilterProviders: [{ getFilters: () => new Map([['id', 'test']]) }],
            fetch: async (_url, init) => ({
                status: 200,
                json: async () =>
                    init.method === 'GET'
                        ? response()
                        : {
                              featureVariables: { blueButton: 'true' },
                              assignedVariants: [],
                              dataVersion: 1,
                              assignmentContext: 'unknown-arm:99999',
                          },
            }),
        });
        await service.initialFetch;
        expect(() => read(service)).toThrow('blueButton.contextId');
        expect(telemetry.sharedProperties.get('context')).toBe(
            'eager:1;blue-button-control-extra:3',
        );
    });

    it('does not replace a treatment mapping when another provider only overrides the companion', async () => {
        const { service, telemetry } = createClient({
            assignmentsEndpoint: 'https://example.test/assignments',
            assignmentsFilterProviders: [{ getFilters: () => new Map([['id', 'test']]) }],
            fetch: async (_url, init) => ({
                status: 200,
                json: async () =>
                    init.method === 'GET'
                        ? response()
                        : {
                              featureVariables: { 'blueButton.contextId': 'orphan-arm' },
                              assignedVariants: [],
                              dataVersion: 1,
                              assignmentContext: 'orphan-arm:99999',
                          },
            }),
        });
        await service.initialFetch;
        const treatment = read(service);
        treatment.release();
        expect({
            value: treatment.value,
            contextId: treatment.contextId,
            context: telemetry.sharedProperties.get('context'),
        }).toEqual({
            value: false,
            contextId: 'blue-button-control',
            context: 'eager:1;blue-button-control:12345;blue-button-control-extra:3',
        });
    });

    it('keeps existing companion coercion for features that have not opted in', async () => {
        const { service } = createClient({
            deferredAssignmentContexts: undefined,
            assignmentsEndpoint: 'https://example.test/assignments',
            assignmentsFilterProviders: [{ getFilters: () => new Map([['id', 'test']]) }],
            fetch: async (_url, init) => ({
                status: 200,
                json: async () =>
                    init.method === 'GET'
                        ? response()
                        : {
                              featureVariables: { 'blueButton.contextId': 'false' },
                              assignedVariants: [],
                              dataVersion: 1,
                              assignmentContext: 'false:99999',
                          },
            }),
        });
        await service.initialFetch;
        expect(service.getTreatmentVariable('vscode', 'blueButton.contextId')).toBe(false);
    });

    it('releases the consumed assignment rather than a background-polled replacement', async () => {
        let data = response();
        const { service, telemetry, storage } = createClient({
            fetch: async () => ({ status: 200, json: async () => data }),
        });
        await service.initialFetch;
        const treatment = read(service);
        data = response('next-arm', 4);
        await service.refreshInBackground();
        treatment.release();
        const next = createClient({ keyValueStorage: storage });
        await next.service.initializePromise;
        expect({
            active: telemetry.sharedProperties.get('context'),
            next: next.telemetry.sharedProperties.get('context'),
        }).toEqual({
            active: response().AssignmentContext,
            next: 'eager:1;next-arm-extra:3;',
        });
    });

    it('does not trust caches created before deferral was configured', async () => {
        const storage = new KeyValueStorageMock();
        storage.setValue('features', {
            features: [],
            configs: response().Configs,
            assignmentContext: response().AssignmentContext,
        });
        const { service, published } = createClient({ keyValueStorage: storage });
        await service.initialFetch;
        expect(published.mock.calls.map(([, value]) => value)).toEqual([
            '',
            'eager:1;blue-button-control-extra:3;',
        ]);
    });

    it('preserves cached responses offline without publishing unreleased context', async () => {
        const first = createClient();
        await first.service.initialFetch;
        const offlineFetch = vi.fn(async () => {
            throw new Error('offline');
        });
        const next = createClient({ keyValueStorage: first.storage, fetch: offlineFetch });
        await next.service.initialFetch;
        const calls = offlineFetch.mock.calls.length;
        const treatment = await next.service.getTreatmentVariableWithExposureAsync(
            'vscode',
            'blueButton',
            true,
        );
        const before = next.telemetry.sharedProperties.get('context');
        treatment.release();
        expect({
            value: treatment.value,
            before,
            calls: offlineFetch.mock.calls.length,
            after: next.telemetry.sharedProperties.get('context'),
        }).toEqual({
            value: false,
            before: 'eager:1;blue-button-control-extra:3;',
            calls,
            after: response().AssignmentContext,
        });
    });

    it('restores eager publication when the opt-in is removed', async () => {
        const first = createClient();
        await first.service.initialFetch;
        const next = createClient({
            keyValueStorage: first.storage,
            deferredAssignmentContexts: undefined,
        });
        await next.service.initializePromise;
        expect(next.telemetry.sharedProperties.get('context')).toBe(response().AssignmentContext);
    });

    it('reports premature reads and flags that were not configured', async () => {
        const { service } = createClient();
        expect(() => read(service)).toThrow('initializePromise');
        await service.initialFetch;
        expect(() => service.getTreatmentVariableWithExposure('vscode', 'other')).toThrow(
            'not deferred',
        );
    });

    it('does not create an assignment for an absent flag, even when its companion is present', async () => {
        const { service, telemetry } = createClient({
            fetch: async () => ({
                status: 200,
                json: async () => ({
                    ...response(),
                    Configs: [
                        {
                            Id: 'vscode',
                            Parameters: { 'blueButton.contextId': 'blue-button-control' },
                        },
                    ],
                }),
            }),
        });
        await service.initialFetch;
        const treatment = read(service);
        expect({
            value: treatment.value,
            released: treatment.release(),
            context: telemetry.sharedProperties.get('context'),
        }).toEqual({
            value: undefined,
            released: false,
            context: 'eager:1;blue-button-control-extra:3;',
        });
    });

    it.each([undefined, false, 12, '', 'arm:123', 'arm;other', 'unassigned-arm', 'blue-button'])(
        'withholds malformed or mismatched companion %s and reports the configuration error',
        async (contextId) => {
            const { service, telemetry } = createClient({
                fetch: async () => ({
                    status: 200,
                    json: async () => ({
                        ...response(),
                        Configs: [
                            {
                                Id: 'vscode',
                                Parameters: {
                                    blueButton: false,
                                    ...(contextId === undefined
                                        ? {}
                                        : { 'blueButton.contextId': contextId }),
                                },
                            },
                        ],
                    }),
                }),
            });
            await service.initialFetch;
            expect(telemetry.sharedProperties.get('context')).toBe('');
            expect(() => read(service)).toThrow('blueButton.contextId');
        },
    );

    it('does not consider a failed persistence write a successful release', async () => {
        const { service, telemetry, storage } = createClient();
        await service.initialFetch;
        const treatment = read(service);
        const write = vi.spyOn(storage, 'setValue').mockImplementationOnce(() => {
            throw new Error('storage unavailable');
        });
        expect(() => treatment.release()).toThrow('storage unavailable');
        const beforeRetry = telemetry.sharedProperties.get('context');
        write.mockRestore();
        treatment.release();
        expect({ beforeRetry, after: telemetry.sharedProperties.get('context') }).toEqual({
            beforeRetry: 'eager:1;blue-button-control-extra:3;',
            after: response().AssignmentContext,
        });
    });

    it('retries failed publication instead of reporting a persisted release as published', async () => {
        const { service, telemetry } = createClient();
        await service.initialFetch;
        const treatment = read(service);
        vi.spyOn(telemetry, 'setSharedProperty').mockImplementationOnce(() => {
            throw new Error('telemetry unavailable');
        });
        expect(() => treatment.release()).toThrow('telemetry unavailable');
        const beforeRetry = telemetry.sharedProperties.get('context');
        treatment.release();
        expect({ beforeRetry, after: telemetry.sharedProperties.get('context') }).toEqual({
            beforeRetry: 'eager:1;blue-button-control-extra:3;',
            after: response().AssignmentContext,
        });
    });

    it('cannot release a captured treatment after the client has been disposed', async () => {
        const { service, telemetry } = createClient();
        await service.initialFetch;
        const treatment = read(service);
        service.dispose();
        expect(() => treatment.release()).toThrow('disposal');
        expect(telemetry.sharedProperties.get('context')).toBe(
            'eager:1;blue-button-control-extra:3;',
        );
    });
});
