/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it } from 'vitest';
import { IExperimentationFilterProvider } from '../src/contracts/IExperimentationFilterProvider.js';
import {
    TasApiFeatureProvider,
    TASAPI_FETCHERROR_EVENTNAME,
    TAS_CALL_EVENTNAME,
} from '../src/tas-client/FeatureProvider/TasApiFeatureProvider.js';
import { FetchError } from '../src/tas-client/Util/HttpClient.js';
import { ExperimentationFilterProviderMock } from './mocks/ExperimentationFilterProviderMock.js';
import { ExperimentationTelemetryMock } from './mocks/ExperimentationTelemetryMock.js';
import { FetchMock } from './mocks/FetchMock.js';
import { HttpClientMock } from './mocks/HttpClientMock.js';

describe('TasApiFeatureProvider', () => {
    const endpoint = 'https://example.test/legacy';
    let http: HttpClientMock;
    let telemetry: ExperimentationTelemetryMock;

    beforeEach(() => {
        http = new HttpClientMock();
        telemetry = new ExperimentationTelemetryMock();
        http.get.mockResolvedValue({ data: { Configs: [], AssignmentContext: 'legacy;' } });
    });

    function createProvider(filters: IExperimentationFilterProvider[] = [], transport?: FetchMock) {
        return new TasApiFeatureProvider(http, telemetry, filters, endpoint, transport?.fetch);
    }

    function expectFailure(outcome: string) {
        expect(
            telemetry.eventsNamed(TASAPI_FETCHERROR_EVENTNAME).map((event) => event.args),
        ).toEqual([new Map([['ErrorType', outcome]])]);
        expect(telemetry.eventsNamed(TAS_CALL_EVENTNAME).map((event) => event.args)).toEqual([
            new Map([
                ['callType', 'legacy'],
                ['outcome', outcome],
                ['extensionName', ''],
                ['assignmentContext', ''],
            ]),
        ]);
    }

    it('uses the built-in GET transport and reports success without error or empty header telemetry', async () => {
        expect(await createProvider().getFeatures()).toEqual({
            features: [],
            assignmentContext: 'legacy;',
            configs: [],
        });
        expect(http.get).toHaveBeenCalledExactlyOnceWith({ headers: {} });
        expect(http.post).not.toHaveBeenCalled();
        expect(telemetry.eventsNamed(TASAPI_FETCHERROR_EVENTNAME)).toHaveLength(0);
        expect(telemetry.eventsNamed('report-headers')).toHaveLength(0);
        expect(telemetry.eventsNamed(TAS_CALL_EVENTNAME)[0].args).toEqual(
            new Map([
                ['callType', 'legacy'],
                ['outcome', 'Success'],
                ['extensionName', ''],
                ['assignmentContext', 'legacy;'],
            ]),
        );
    });

    it('maps typed parameters to flights and counterfactual flights without duplicates', async () => {
        const configs = [
            {
                Id: 'vscode',
                Parameters: {
                    enabled: true,
                    disabled: false,
                    count: 3,
                    zero: 0,
                    label: 'new',
                    empty: '',
                },
            },
            { Id: 'extension', Parameters: { enabled: true, disabled: false } },
            { Id: 'without-parameters' },
            { Id: 'null-parameters', Parameters: null },
        ];
        http.get.mockResolvedValueOnce({
            data: { Configs: configs, AssignmentContext: 'variants;' },
        });

        expect(await createProvider().getFeatures()).toEqual({
            features: ['enabled', 'disabledcf', 'count', 'zerocf', 'label', 'emptycf'],
            assignmentContext: 'variants;',
            configs,
        });
    });

    it('uses the supplied transport with merged filter headers and caller telemetry', async () => {
        const transport = new FetchMock();
        const response = transport.respondWith({ Configs: [], AssignmentContext: 'custom;' });
        const filters = [
            new ExperimentationFilterProviderMock([
                ['X-Version', '1.0'],
                ['X-Ring', 'public'],
            ]),
            new ExperimentationFilterProviderMock([['X-Ring', 'insiders']]),
        ];
        const provider = new TasApiFeatureProvider(
            http,
            telemetry,
            filters,
            endpoint,
            transport.fetch,
            'example.extension',
        );

        await provider.getFeatures();

        expect(transport.fetch).toHaveBeenCalledExactlyOnceWith(endpoint, {
            method: 'GET',
            headers: { 'X-Version': '1.0', 'X-Ring': 'insiders' },
        });
        expect(response.json).toHaveBeenCalledTimes(1);
        expect(http.get).not.toHaveBeenCalled();
        expect(telemetry.eventsNamed(TAS_CALL_EVENTNAME)[0].args).toEqual(
            new Map([
                ['callType', 'legacy'],
                ['outcome', 'Success'],
                ['extensionName', 'example.extension'],
                ['assignmentContext', 'custom;'],
            ]),
        );
    });

    it('reports each distinct filter set once, even though headers are rebuilt for each request', async () => {
        const filters = new ExperimentationFilterProviderMock([['X-Ring', 'public']]);
        const provider = createProvider([filters]);

        await provider.getFeatures();
        await provider.getFeatures();
        filters.filters.set('X-Ring', 'insiders');
        await provider.getFeatures();

        expect(http.get).toHaveBeenCalledTimes(3);
        expect(
            telemetry.eventsNamed('report-headers').map((event) => event.args.get('ABExp.headers')),
        ).toEqual(['{"X-Ring":"public"}', '{"X-Ring":"insiders"}']);
        expect(telemetry.eventsNamed(TAS_CALL_EVENTNAME)).toHaveLength(3);
    });

    it.each([200, 299])('accepts custom-transport success status %i', async (status) => {
        const transport = new FetchMock();
        transport.respondWith({ Configs: [] }, status);

        expect((await createProvider([], transport).getFeatures()).configs).toEqual([]);
        expect(telemetry.eventsNamed(TAS_CALL_EVENTNAME)[0].args.get('assignmentContext')).toBe('');
    });

    it.each([199, 300, 404, 503])('rejects status %i before parsing its body', async (status) => {
        const transport = new FetchMock();
        const response = transport.respondWith({ Configs: [] }, status);

        await expect(createProvider([], transport).getFeatures()).rejects.toThrow(
            TASAPI_FETCHERROR_EVENTNAME,
        );

        expect(response.json).not.toHaveBeenCalled();
        expectFailure('ServerError');
    });

    it.each<[Error, string]>([
        [new FetchError('HTTP error', true, false), 'ServerError'],
        [new FetchError('No connection', false), 'NoResponse'],
        [new FetchError('Unreadable response', true, true), 'GenericError'],
        [new Error('Transport setup failed'), 'GenericError'],
    ])('classifies built-in transport error %j as %s', async (error, outcome) => {
        http.get.mockRejectedValueOnce(error);

        await expect(createProvider().getFeatures()).rejects.toThrow(TASAPI_FETCHERROR_EVENTNAME);
        expectFailure(outcome);
    });

    it.each([undefined, null])('rejects a missing response payload (%j)', async (data) => {
        http.get.mockResolvedValueOnce({ data });

        await expect(createProvider().getFeatures()).rejects.toThrow(TASAPI_FETCHERROR_EVENTNAME);
        expectFailure('NoResponse');
    });

    it.each([{}, { Configs: null }, { Configs: {} }, { Configs: [null] }])(
        'reports malformed legacy data as failure rather than success: %j',
        async (data) => {
            http.get.mockResolvedValueOnce({ data });

            await expect(createProvider().getFeatures()).rejects.toThrow(
                TASAPI_FETCHERROR_EVENTNAME,
            );
            expectFailure('GenericError');
        },
    );

    it('classifies custom transport and JSON errors and can recover on the next request', async () => {
        const transport = new FetchMock();
        transport.fetch.mockRejectedValueOnce(new Error('Proxy unavailable'));
        const malformed = transport.respondWith(undefined);
        malformed.json.mockRejectedValueOnce(new SyntaxError('Invalid JSON'));
        transport.respondWith({ Configs: [], AssignmentContext: 'recovered;' });
        const provider = createProvider([], transport);

        await expect(provider.getFeatures()).rejects.toThrow(TASAPI_FETCHERROR_EVENTNAME);
        await expect(provider.getFeatures()).rejects.toThrow(TASAPI_FETCHERROR_EVENTNAME);
        expect((await provider.getFeatures()).assignmentContext).toBe('recovered;');
        expect(
            telemetry.eventsNamed(TAS_CALL_EVENTNAME).map((event) => event.args.get('outcome')),
        ).toEqual(['GenericError', 'GenericError', 'Success']);
        expect(http.get).not.toHaveBeenCalled();
    });
});
