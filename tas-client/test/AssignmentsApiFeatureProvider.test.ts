/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    AssignmentsApiFeatureProvider,
    ASSIGNMENTS_FETCHERROR_EVENTNAME,
    ASSIGNMENTS_VALIDATION_EVENTNAME,
    TAS_CALL_EVENTNAME,
} from '../src/tas-client/FeatureProvider/AssignmentsApiFeatureProvider.js';
import { FetchError } from '../src/tas-client/Util/HttpClient.js';
import { ExperimentationFilterProviderMock } from './mocks/ExperimentationFilterProviderMock.js';
import { ExperimentationTelemetryMock } from './mocks/ExperimentationTelemetryMock.js';
import { FetchMock } from './mocks/FetchMock.js';
import { HttpClientMock } from './mocks/HttpClientMock.js';

describe('AssignmentsApiFeatureProvider', () => {
    const endpoint = 'https://example.test/assignments';
    let http: HttpClientMock;
    let telemetry: ExperimentationTelemetryMock;
    let filters: ExperimentationFilterProviderMock;

    beforeEach(() => {
        http = new HttpClientMock();
        telemetry = new ExperimentationTelemetryMock();
        filters = new ExperimentationFilterProviderMock([['X-VSCode-Build', 'insider']]);
        http.post.mockResolvedValue({
            data: {
                featureVariables: {},
                assignedVariants: [],
                dataVersion: 7,
                assignmentContext: 'new;',
            },
        });
    });

    function createProvider(transport?: FetchMock) {
        return new AssignmentsApiFeatureProvider(
            http,
            telemetry,
            [filters],
            endpoint,
            transport?.fetch,
        );
    }

    function expectFailure(outcome: string) {
        expect(
            telemetry.eventsNamed(ASSIGNMENTS_FETCHERROR_EVENTNAME).map((event) => event.args),
        ).toEqual([new Map([['ErrorType', outcome]])]);
        expect(telemetry.eventsNamed(ASSIGNMENTS_VALIDATION_EVENTNAME)).toHaveLength(0);
        expect(telemetry.eventsNamed(TAS_CALL_EVENTNAME).map((event) => event.args)).toEqual([
            new Map([
                ['callType', 'assignments'],
                ['outcome', outcome],
                ['extensionName', ''],
                ['assignmentContext', ''],
            ]),
        ]);
    }

    it('posts user params, dropping only null, undefined and empty string values', async () => {
        filters.filters.set('X-Empty', '');
        filters.filters.set('X-Null', null);
        filters.filters.set('X-Undefined', undefined);
        filters.filters.set('IsInternal', false);
        filters.filters.set('Version', 0);

        await createProvider().getFeatures();

        expect(http.post).toHaveBeenCalledExactlyOnceWith({
            body: {
                userParams: { 'X-VSCode-Build': 'insider', IsInternal: 'false', Version: '0' },
            },
        });
        expect(http.get).not.toHaveBeenCalled();
    });

    it('caps merged non-empty user params at 50 while honoring later provider overrides', async () => {
        const entries = Array.from({ length: 55 }, (_, index): [string, string] => [
            `attribute${index}`,
            `value${index}`,
        ]);
        const first = new ExperimentationFilterProviderMock([['empty', ''], ...entries]);
        const second = new ExperimentationFilterProviderMock([['attribute0', 'overridden']]);
        const provider = new AssignmentsApiFeatureProvider(http, telemetry, [first, second]);
        const expected = Object.fromEntries(entries.slice(0, 50));
        expected.attribute0 = 'overridden';

        await provider.getFeatures();

        expect(http.post).toHaveBeenCalledExactlyOnceWith({ body: { userParams: expected } });
        expect(Object.keys(expected)).toHaveLength(50);
    });

    it.each([false, true])(
        'skips requests when no valid params remain (filters supplied: %s)',
        async (supplied) => {
            const transport = new FetchMock();
            const provider = new AssignmentsApiFeatureProvider(
                http,
                telemetry,
                supplied
                    ? [
                          new ExperimentationFilterProviderMock([
                              ['empty', ''],
                              ['null', null],
                              ['missing', undefined],
                          ]),
                      ]
                    : [],
                endpoint,
                transport.fetch,
            );

            expect(await provider.getFeatures()).toEqual({
                features: [],
                assignmentContext: '',
                configs: [],
            });
            expect(http.post).not.toHaveBeenCalled();
            expect(transport.fetch).not.toHaveBeenCalled();
            expect(telemetry.postedEvents).toHaveLength(0);
        },
    );

    it('strips only the vscode scope, coerces typed values, and deduplicates enabled flights', async () => {
        http.post.mockResolvedValueOnce({
            data: {
                featureVariables: {
                    '/vscode/enabled': 'true',
                    enabled: 'true',
                    '/vscode/disabled': 'false',
                    '/vscode/rollout': '0',
                    '/vscode/negative': '-3',
                    '/vscode/ratio': '1.25',
                    '/vscode/limit': '1e3',
                    '/vscode/variant': 'treatment',
                    '/vscode/empty': '',
                    '/other/flag': 'true',
                },
                assignedVariants: [],
                dataVersion: 7,
                assignmentContext: 'new;',
            },
        });

        expect(await createProvider().getFeatures()).toEqual({
            features: ['enabled', 'negative', 'ratio', 'limit', 'variant', '/other/flag'],
            assignmentContext: 'new;',
            configs: [
                {
                    Id: 'vscode',
                    Parameters: {
                        enabled: true,
                        disabled: false,
                        rollout: 0,
                        negative: -3,
                        ratio: 1.25,
                        limit: 1000,
                        variant: 'treatment',
                        empty: '',
                        '/other/flag': true,
                    },
                },
            ],
        });
    });

    it('retains configurations when every treatment is falsy without inventing cf flights', async () => {
        http.post.mockResolvedValueOnce({
            data: {
                featureVariables: { enabled: 'false', rollout: '0', label: '' },
                assignmentContext: 'control;',
            },
        });

        expect(await createProvider().getFeatures()).toEqual({
            features: [],
            assignmentContext: 'control;',
            configs: [{ Id: 'vscode', Parameters: { enabled: false, rollout: 0, label: '' } }],
        });
    });

    it('handles an empty assignment envelope and missing optional telemetry metadata', async () => {
        http.post.mockResolvedValueOnce({ data: { dataVersion: 0 } });

        expect(await createProvider().getFeatures()).toEqual({
            features: [],
            assignmentContext: '',
            configs: [],
        });
        expect(telemetry.eventsNamed(ASSIGNMENTS_VALIDATION_EVENTNAME)[0].args).toEqual(
            new Map([
                ['FeatureVariableCount', '0'],
                ['AssignedVariantCount', '0'],
                ['DataVersion', '0'],
                ['AssignmentContext', ''],
            ]),
        );
    });

    it('uses custom POST transport and reports the caller, assignment context, and validation counts', async () => {
        const transport = new FetchMock();
        const response = transport.respondWith({
            featureVariables: { '/vscode/enabled': 'true', '/vscode/disabled': 'false' },
            assignedVariants: [
                { name: 'enabled', numberline: 'line1', isForced: false, variantAllocationId: 1 },
                { name: 'disabled', numberline: 'line2', isForced: true, variantAllocationId: 2 },
            ],
            dataVersion: 7,
            assignmentContext: 'custom;',
        });
        const provider = new AssignmentsApiFeatureProvider(
            http,
            telemetry,
            [filters],
            endpoint,
            transport.fetch,
            'example.extension',
        );

        await provider.getFeatures();

        expect(transport.fetch).toHaveBeenCalledExactlyOnceWith(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userParams: { 'X-VSCode-Build': 'insider' } }),
        });
        expect(response.json).toHaveBeenCalledTimes(1);
        expect(http.post).not.toHaveBeenCalled();
        expect(telemetry.eventsNamed(ASSIGNMENTS_VALIDATION_EVENTNAME)[0].args).toEqual(
            new Map([
                ['FeatureVariableCount', '2'],
                ['AssignedVariantCount', '2'],
                ['DataVersion', '7'],
                ['AssignmentContext', 'custom;'],
            ]),
        );
        expect(telemetry.eventsNamed(TAS_CALL_EVENTNAME)[0].args).toEqual(
            new Map([
                ['callType', 'assignments'],
                ['outcome', 'Success'],
                ['extensionName', 'example.extension'],
                ['assignmentContext', 'custom;'],
            ]),
        );
    });

    it('does not discard assignments when validation telemetry throws', async () => {
        const recordEvent = telemetry.postEvent.bind(telemetry);
        vi.spyOn(telemetry, 'postEvent').mockImplementation((eventName, args) => {
            if (eventName === ASSIGNMENTS_VALIDATION_EVENTNAME) {
                throw new Error('Telemetry unavailable');
            }
            recordEvent(eventName, args);
        });

        expect((await createProvider().getFeatures()).assignmentContext).toBe('new;');
        expect(telemetry.eventsNamed(ASSIGNMENTS_FETCHERROR_EVENTNAME)).toHaveLength(0);
        expect(telemetry.eventsNamed(TAS_CALL_EVENTNAME)[0].args.get('outcome')).toBe('Success');
    });

    it.each([200, 299])('accepts custom-transport success status %i', async (status) => {
        const transport = new FetchMock();
        transport.respondWith({ featureVariables: { enabled: 'true' } }, status);

        expect((await createProvider(transport).getFeatures()).features).toEqual(['enabled']);
    });

    it.each([199, 300, 404, 503])('rejects status %i before parsing its body', async (status) => {
        const transport = new FetchMock();
        const response = transport.respondWith({}, status);

        await expect(createProvider(transport).getFeatures()).rejects.toMatchObject({
            responseReceived: true,
            responseOk: false,
        });
        expect(response.json).not.toHaveBeenCalled();
        expectFailure('ServerError');
    });

    it.each<[Error, string]>([
        [new FetchError('HTTP error', true, false), 'ServerError'],
        [new FetchError('No connection', false), 'NoResponse'],
        [new FetchError('Unreadable response', true, true), 'GenericError'],
        [new Error('Transport setup failed'), 'GenericError'],
    ])('classifies built-in transport error %j as %s', async (error, outcome) => {
        http.post.mockRejectedValueOnce(error);

        await expect(createProvider().getFeatures()).rejects.toBe(error);
        expectFailure(outcome);
    });

    it.each([undefined, null])('rejects a missing response payload (%j)', async (data) => {
        http.post.mockResolvedValueOnce({ data });

        await expect(createProvider().getFeatures()).rejects.toMatchObject({
            responseReceived: false,
        });
        expectFailure('NoResponse');
    });

    it('classifies custom transport and JSON failures, then recovers on a later request', async () => {
        const transport = new FetchMock();
        const networkError = new Error('Proxy unavailable');
        const parseError = new SyntaxError('Invalid JSON');
        transport.fetch.mockRejectedValueOnce(networkError);
        transport.respondWith(undefined).json.mockRejectedValueOnce(parseError);
        transport.respondWith({ featureVariables: { enabled: 'true' } });
        const provider = createProvider(transport);

        await expect(provider.getFeatures()).rejects.toBe(networkError);
        await expect(provider.getFeatures()).rejects.toBe(parseError);
        expect((await provider.getFeatures()).features).toEqual(['enabled']);
        expect(
            telemetry.eventsNamed(TAS_CALL_EVENTNAME).map((event) => event.args.get('outcome')),
        ).toEqual(['GenericError', 'GenericError', 'Success']);
        expect(http.post).not.toHaveBeenCalled();
    });
});
