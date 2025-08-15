/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExperimentationTelemetry } from '../src/contracts/IExperimentationTelemetry';
import {
    TasApiFeatureProvider,
    TASAPI_FETCHERROR_EVENTNAME,
} from '../src/tas-client/FeatureProvider/TasApiFeatureProvider';
import { FetchError, FetchResult, HttpClient } from '../src/tas-client/Util/HttpClient';
import { It, Mock, Times } from 'typemoq';
import { expect, describe, it } from 'vitest';

describe('TAS Api Feature Provider Tests', () => {
    it('Should NOT send telemetry when no error ocurred.', async () => {
        // init
        const httpClient = Mock.ofType<HttpClient>();
        const telemetry = Mock.ofType<IExperimentationTelemetry>();
        const fetchResponse = Mock.ofType<FetchResult>();
        const responseData = { Configs: [], AssignmentContext: 'test' };

        // setup

        // NOTE: We need to add this in order to be able to return this object
        // within a promise.
        fetchResponse.setup((a: any) => a.then).returns(() => undefined);

        // 1) Setup dummy response to be able to return data.Configs as it's needed
        // for a succesful run.
        fetchResponse.setup((a) => a.data).returns(() => responseData);

        // 2) Return resolved response to simulate succesful call.
        httpClient
            .setup((a) => a.get(It.isAny()))
            .returns(() => Promise.resolve(fetchResponse.object))
            .verifiable(Times.once());

        // 3) Telemetry should not be called.
        telemetry
            .setup((t) => t.postEvent(It.isValue(TASAPI_FETCHERROR_EVENTNAME), It.isAny()))
            .verifiable(Times.never());

        // execute
        const tasApiProvider = new TasApiFeatureProvider(httpClient.object, telemetry.object, []);
        await tasApiProvider.fetch();

        // verify
        httpClient.verifyAll();
        telemetry.verifyAll();
    });

    it('Should send telemetry of type ServerError when error was return from the server.', async () => {
        // init
        const httpClient = Mock.ofType<HttpClient>();
        const telemetry = Mock.ofType<IExperimentationTelemetry>();
        const fetchError = new FetchError('ServerError', true, false);

        // setup
        // 1) Return reject response to simulate unsuccessfull call.
        httpClient
            .setup((a) => a.get(It.isAny()))
            .returns(() => Promise.reject(fetchError))
            .verifiable(Times.once());

        // 2) Telemetry should be called with the right event.
        // In this case, ErrorType should be 'ServerError'
        telemetry
            .setup((t) =>
                t.postEvent(
                    It.isValue(TASAPI_FETCHERROR_EVENTNAME),
                    It.is((map) => map.get('ErrorType') === 'ServerError'),
                ),
            )
            .verifiable(Times.once());

        // execute
        const tasApiProvider = new TasApiFeatureProvider(httpClient.object, telemetry.object, []);
        let exceptionThrown = false;
        try {
            await tasApiProvider.fetch();
        } catch (err) {
            expect(err).toBeInstanceOf(Error);
            exceptionThrown = true;
            expect((err as Error).message).toBe(TASAPI_FETCHERROR_EVENTNAME);
        }
        // verify
        httpClient.verifyAll();
        telemetry.verifyAll();
        // assert exception was thrown.
        expect(exceptionThrown).toBe(true);
    });

    it('Should send telemetry of type NoResponse when no response was returned from the server but a request exists.', async () => {
        // init
        const httpClient = Mock.ofType<HttpClient>();
        const telemetry = Mock.ofType<IExperimentationTelemetry>();
        const fetchError = new FetchError('NoResponse', false);

        // setup
        // 1) Return reject response to simulate unsuccessfull call.
        httpClient
            .setup((a) => a.get(It.isAny()))
            .returns(() => Promise.reject(fetchError))
            .verifiable(Times.once());

        // 2) Telemetry should be called with the right event.
        // In this case, ErrorType should be 'NoResponse'
        telemetry
            .setup((t) =>
                t.postEvent(
                    It.isValue(TASAPI_FETCHERROR_EVENTNAME),
                    It.is((map) => map.get('ErrorType') === 'NoResponse'),
                ),
            )
            .verifiable(Times.once());

        // execute
        const tasApiProvider = new TasApiFeatureProvider(httpClient.object, telemetry.object, []);
        let exceptionThrown = false;
        try {
            await tasApiProvider.fetch();
        } catch (err) {
            expect(err).toBeInstanceOf(Error);
            exceptionThrown = true;
            expect((err as Error).message).toBe(TASAPI_FETCHERROR_EVENTNAME);
        }
        // verify
        httpClient.verifyAll();
        telemetry.verifyAll();
        // assert exception was thrown.
        expect(exceptionThrown).toBe(true);
    });

    it('Should send telemetry of type GenericError when no request or response was available in the response.', async () => {
        // init
        const httpClient = Mock.ofType<HttpClient>();
        const telemetry = Mock.ofType<IExperimentationTelemetry>();
        const fetchError = Mock.ofType<FetchError>();
        // We need to add this in order to be able to return this object
        // within a promise.
        fetchError.setup((a: any) => a.then).returns(() => undefined);
        // Setup undefined response and undefined request, so that error is interpreted as generic.
        fetchError.setup((e) => e.responseOk).returns(() => undefined);
        fetchError.setup((e) => e.responseReceived).returns(() => undefined);

        // setup
        // 1) Return reject response to simulate unsuccessfull call.
        httpClient
            .setup((a) => a.get(It.isAny()))
            .returns(() => Promise.reject(fetchError.object))
            .verifiable(Times.once());

        // 2) Telemetry should be called with the right event.
        // In this case, ErrorType should be NoResponse
        telemetry
            .setup((t) =>
                t.postEvent(
                    It.isValue(TASAPI_FETCHERROR_EVENTNAME),
                    It.is((map) => map.get('ErrorType') === 'GenericError'),
                ),
            )
            .verifiable(Times.once());

        // execute
        const tasApiProvider = new TasApiFeatureProvider(httpClient.object, telemetry.object, []);
        let exceptionThrown = false;
        try {
            await tasApiProvider.fetch();
        } catch (err) {
            expect(err).toBeInstanceOf(Error);
            exceptionThrown = true;
            expect((err as Error).message).toBe(TASAPI_FETCHERROR_EVENTNAME);
        }
        // verify
        httpClient.verifyAll();
        telemetry.verifyAll();
        // assert exception was thrown.
        expect(exceptionThrown).toBe(true);
    });
});
