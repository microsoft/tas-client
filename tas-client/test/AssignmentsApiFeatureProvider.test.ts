/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExperimentationTelemetry } from '../src/contracts/IExperimentationTelemetry.js';
import { IExperimentationFilterProvider } from '../src/contracts/IExperimentationFilterProvider.js';
import {
    AssignmentsApiFeatureProvider,
    AssignmentRequest,
    ASSIGNMENTS_FETCHERROR_EVENTNAME,
    ASSIGNMENTS_VALIDATION_EVENTNAME,
} from '../src/tas-client/FeatureProvider/AssignmentsApiFeatureProvider.js';
import { FetchError, FetchResult, HttpClient } from '../src/tas-client/Util/HttpClient.js';
import { It, Mock, Times } from 'typemoq';
import { expect, describe, it } from 'vitest';

class OneFilterProvider implements IExperimentationFilterProvider {
    public getFilters(): Map<string, any> {
        const filters = new Map<string, any>();
        filters.set('X-VSCode-Build', 'insider');
        filters.set('X-Empty', '');
        filters.set('X-Null', null);
        return filters;
    }
}

describe('Assignments Api Feature Provider Tests', () => {
    it('Should POST userParams built from non-empty filters.', async () => {
        const httpClient = Mock.ofType<HttpClient>();
        const telemetry = Mock.ofType<IExperimentationTelemetry>();
        const fetchResponse = Mock.ofType<FetchResult>();
        const responseData = {
            featureVariables: { foo: 'bar' },
            assignedVariants: [],
            dataVersion: 3,
            assignmentContext: 'ctx',
        };

        fetchResponse.setup((a: any) => a.then).returns(() => undefined);
        fetchResponse.setup((a) => a.data).returns(() => responseData);

        let capturedBody: AssignmentRequest | undefined;
        httpClient
            .setup((a) => a.post(It.isAny()))
            .callback((cfg: any) => {
                capturedBody = cfg?.body as AssignmentRequest;
            })
            .returns(() => Promise.resolve(fetchResponse.object))
            .verifiable(Times.once());

        const provider = new AssignmentsApiFeatureProvider(httpClient.object, telemetry.object, [
            new OneFilterProvider(),
        ]);
        const result = await provider.fetch();

        httpClient.verifyAll();
        // Only the non-empty, non-null filter should be present.
        expect(capturedBody).toEqual({ userParams: { 'X-VSCode-Build': 'insider' } });
        // Response is mapped and merged into the active feature set.
        expect(result).toEqual({
            features: ['foo'],
            assignmentContext: 'ctx',
            configs: [{ Id: 'vscode', Parameters: { foo: 'bar' } }],
        });
    });

    it('Should strip the /vscode/ scope prefix from returned feature variable keys.', async () => {
        const httpClient = Mock.ofType<HttpClient>();
        const telemetry = Mock.ofType<IExperimentationTelemetry>();
        const fetchResponse = Mock.ofType<FetchResult>();
        const responseData = {
            featureVariables: {
                '/vscode/config.foo': 'true',
                '/vscode/config.bar': 'baz',
                'config.unscoped': '1',
            },
            assignedVariants: [],
            dataVersion: 4,
            assignmentContext: 'ctx',
        };

        fetchResponse.setup((a: any) => a.then).returns(() => undefined);
        fetchResponse.setup((a) => a.data).returns(() => responseData);
        httpClient
            .setup((a) => a.post(It.isAny()))
            .returns(() => Promise.resolve(fetchResponse.object));

        const provider = new AssignmentsApiFeatureProvider(httpClient.object, telemetry.object, [
            new OneFilterProvider(),
        ]);
        const result = await provider.fetch();

        // Scoped keys are stored under their bare name; unscoped keys are left as-is. Coerced
        // values and the enabled-flights list also use the bare names.
        expect(result).toEqual({
            features: ['config.foo', 'config.bar', 'config.unscoped'],
            assignmentContext: 'ctx',
            configs: [
                {
                    Id: 'vscode',
                    Parameters: {
                        'config.foo': true,
                        'config.bar': 'baz',
                        'config.unscoped': 1,
                    },
                },
            ],
        });
    });

    it('Should POST userParams using the filter keys verbatim.', async () => {
        const httpClient = Mock.ofType<HttpClient>();
        const telemetry = Mock.ofType<IExperimentationTelemetry>();
        const fetchResponse = Mock.ofType<FetchResult>();
        const responseData = {
            featureVariables: {},
            assignedVariants: [],
            dataVersion: 1,
            assignmentContext: '',
        };

        fetchResponse.setup((a: any) => a.then).returns(() => undefined);
        fetchResponse.setup((a) => a.data).returns(() => responseData);

        let capturedBody: AssignmentRequest | undefined;
        httpClient
            .setup((a) => a.post(It.isAny()))
            .callback((cfg: any) => {
                capturedBody = cfg?.body as AssignmentRequest;
            })
            .returns(() => Promise.resolve(fetchResponse.object));

        const provider = new AssignmentsApiFeatureProvider(
            httpClient.object,
            telemetry.object,
            [new OneFilterProvider()],
        );
        await provider.fetch();

        // Assignments providers emit the final key names; empty/null values are dropped.
        expect(capturedBody).toEqual({ userParams: { 'X-VSCode-Build': 'insider' } });
    });

    it('Should post validation telemetry on success.', async () => {
        const httpClient = Mock.ofType<HttpClient>();
        const telemetry = Mock.ofType<IExperimentationTelemetry>();
        const fetchResponse = Mock.ofType<FetchResult>();
        const responseData = {
            featureVariables: { foo: 'bar', baz: 'qux' },
            assignedVariants: [{ name: 'v1' }],
            dataVersion: 7,
            assignmentContext: 'ctx',
        };

        fetchResponse.setup((a: any) => a.then).returns(() => undefined);
        fetchResponse.setup((a) => a.data).returns(() => responseData);
        httpClient
            .setup((a) => a.post(It.isAny()))
            .returns(() => Promise.resolve(fetchResponse.object));

        telemetry
            .setup((t) =>
                t.postEvent(
                    It.isValue(ASSIGNMENTS_VALIDATION_EVENTNAME),
                    It.is(
                        (map) =>
                            map.get('FeatureVariableCount') === '2' &&
                            map.get('AssignedVariantCount') === '1' &&
                            map.get('DataVersion') === '7' &&
                            map.get('AssignmentContext') === 'ctx',
                    ),
                ),
            )
            .verifiable(Times.once());

        const provider = new AssignmentsApiFeatureProvider(httpClient.object, telemetry.object, [
            new OneFilterProvider(),
        ]);
        await provider.fetch();

        telemetry.verifyAll();
    });

    it('Should NOT call the endpoint when there are no userParams.', async () => {
        const httpClient = Mock.ofType<HttpClient>();
        const telemetry = Mock.ofType<IExperimentationTelemetry>();

        httpClient.setup((a) => a.post(It.isAny())).verifiable(Times.never());

        const provider = new AssignmentsApiFeatureProvider(httpClient.object, telemetry.object, []);
        const result = await provider.fetch();

        httpClient.verifyAll();
        expect(result).toEqual({ features: [], assignmentContext: '', configs: [] });
    });

    it('Should emit error telemetry and reject when the request fails.', async () => {
        const httpClient = Mock.ofType<HttpClient>();
        const telemetry = Mock.ofType<IExperimentationTelemetry>();
        const fetchError = new FetchError('ServerError', true, false);

        httpClient.setup((a) => a.post(It.isAny())).returns(() => Promise.reject(fetchError));

        telemetry
            .setup((t) =>
                t.postEvent(
                    It.isValue(ASSIGNMENTS_FETCHERROR_EVENTNAME),
                    It.is((map) => map.get('ErrorType') === 'ServerError'),
                ),
            )
            .verifiable(Times.once());

        const provider = new AssignmentsApiFeatureProvider(httpClient.object, telemetry.object, [
            new OneFilterProvider(),
        ]);

        // Rejects so the base service's fault-isolation excludes this provider.
        await expect(provider.fetch()).rejects.toBeDefined();

        telemetry.verifyAll();
    });

    it('Should map featureVariables into a vscode config with coerced values and no cf suffix.', async () => {
        const httpClient = Mock.ofType<HttpClient>();
        const telemetry = Mock.ofType<IExperimentationTelemetry>();
        const fetchResponse = Mock.ofType<FetchResult>();
        const responseData = {
            featureVariables: {
                boolTrue: 'true',
                boolFalse: 'false',
                num: '42',
                str: 'treatment',
            },
            assignedVariants: [],
            dataVersion: 5,
            assignmentContext: 'ctx',
        };

        fetchResponse.setup((a: any) => a.then).returns(() => undefined);
        fetchResponse.setup((a) => a.data).returns(() => responseData);
        httpClient
            .setup((a) => a.post(It.isAny()))
            .returns(() => Promise.resolve(fetchResponse.object));

        const provider = new AssignmentsApiFeatureProvider(httpClient.object, telemetry.object, [
            new OneFilterProvider(),
        ]);
        const result = await provider.fetch();

        expect(result.assignmentContext).toBe('ctx');
        // Strings are coerced to booleans/numbers so lookups match the legacy provider's types.
        expect(result.configs).toEqual([
            {
                Id: 'vscode',
                Parameters: { boolTrue: true, boolFalse: false, num: 42, str: 'treatment' },
            },
        ]);
        // No 'cf' suffix; only truthy-valued variables are listed as enabled flights.
        expect(result.features).toEqual(['boolTrue', 'num', 'str']);
    });

    it('Should keep configs even when every variable is falsy.', async () => {
        const httpClient = Mock.ofType<HttpClient>();
        const telemetry = Mock.ofType<IExperimentationTelemetry>();
        const fetchResponse = Mock.ofType<FetchResult>();
        const responseData = {
            featureVariables: { flag: 'false' },
            assignedVariants: [],
            dataVersion: 1,
            assignmentContext: '',
        };

        fetchResponse.setup((a: any) => a.then).returns(() => undefined);
        fetchResponse.setup((a) => a.data).returns(() => responseData);
        httpClient
            .setup((a) => a.post(It.isAny()))
            .returns(() => Promise.resolve(fetchResponse.object));

        const provider = new AssignmentsApiFeatureProvider(httpClient.object, telemetry.object, [
            new OneFilterProvider(),
        ]);
        const result = await provider.fetch();

        expect(result.features).toEqual([]);
        expect(result.configs).toEqual([{ Id: 'vscode', Parameters: { flag: false } }]);
    });

    it('Should use the provided fetchFn transport instead of the HTTP client.', async () => {
        const httpClient = Mock.ofType<HttpClient>();
        const telemetry = Mock.ofType<IExperimentationTelemetry>();
        const responseData = {
            featureVariables: { foo: 'bar' },
            assignedVariants: [],
            dataVersion: 1,
            assignmentContext: 'ctx',
        };

        let calledUrl: string | undefined;
        let calledInit: { method: string; headers: Record<string, string>; body: string } | undefined;
        const fetchFn = async (
            url: string,
            init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string },
        ) => {
            calledUrl = url;
            calledInit = init as typeof calledInit;
            return { status: 200, json: async () => responseData };
        };

        httpClient.setup((a) => a.post(It.isAny())).verifiable(Times.never());

        const provider = new AssignmentsApiFeatureProvider(
            httpClient.object,
            telemetry.object,
            [new OneFilterProvider()],
            'https://example.test/api/v1/assignments',
            fetchFn,
        );
        const result = await provider.fetch();

        httpClient.verifyAll(); // built-in POST must not be used
        expect(calledUrl).toBe('https://example.test/api/v1/assignments');
        expect(calledInit?.method).toBe('POST');
        expect(JSON.parse(calledInit!.body)).toEqual({
            userParams: { 'X-VSCode-Build': 'insider' },
        });
        expect(result.configs).toEqual([{ Id: 'vscode', Parameters: { foo: 'bar' } }]);
    });

    it('Should post error telemetry and reject when fetchFn returns non-2xx.', async () => {
        const httpClient = Mock.ofType<HttpClient>();
        const telemetry = Mock.ofType<IExperimentationTelemetry>();
        const fetchFn = async () => ({ status: 500, json: async () => ({}) });

        telemetry
            .setup((t) =>
                t.postEvent(
                    It.isValue(ASSIGNMENTS_FETCHERROR_EVENTNAME),
                    It.is((map) => map.get('ErrorType') === 'ServerError'),
                ),
            )
            .verifiable(Times.once());

        const provider = new AssignmentsApiFeatureProvider(
            httpClient.object,
            telemetry.object,
            [new OneFilterProvider()],
            'https://example.test',
            fetchFn,
        );

        await expect(provider.fetch()).rejects.toBeDefined();

        telemetry.verifyAll();
    });
});
