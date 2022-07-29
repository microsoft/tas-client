/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AxiosError, AxiosPromise, AxiosResponse } from 'axios';
import { IExperimentationTelemetry } from 'src';
import {
    TasApiFeatureProvider,
    TASAPI_FETCHERROR_EVENTNAME,
} from '../src/tas-client/FeatureProvider/TasApiFeatureProvider';
import { AxiosHttpClient } from '../src/tas-client/Util/AxiosHttpClient';
import { It, Mock, Times } from 'typemoq';
import { expect } from 'chai';

describe('TAS Api Feature Provider Tests', () => {
    it('Should NOT send telemetry when no error ocurred.', async () => {
        // init
        const axios = Mock.ofType<AxiosHttpClient>();
        const telemetry = Mock.ofType<IExperimentationTelemetry>();
        const axiosResponse = Mock.ofType<AxiosResponse<any>>();
        const responseData = { Configs: [], AssignmentContext: 'test' };

        // setup

        // NOTE: We need to add this in order to be able to return this object
        // within a promise.
        axiosResponse.setup((a: any) => a.then).returns(() => undefined);

        // 1) Setup dummy axios response to be able to return data.Configs as it's needed
        // for a succesful run.
        axiosResponse.setup((a) => a.data).returns(() => responseData);

        // 2) Return resolved axios response to simulate succesful call.
        axios
            .setup((a) => a.get(It.isAny()))
            .returns(() => Promise.resolve(axiosResponse.object))
            .verifiable(Times.once());

        // 3) Telemetry should not be called.
        telemetry
            .setup((t) => t.postEvent(It.isValue(TASAPI_FETCHERROR_EVENTNAME), It.isAny()))
            .verifiable(Times.never());

        // execute
        const tasApiProvider = new TasApiFeatureProvider(axios.object, telemetry.object, []);
        await tasApiProvider.fetch();

        // verify
        axios.verifyAll();
        telemetry.verifyAll();
    });

    it('Should send telemetry of type ServerError when error was return from the server.', async () => {
        // init
        const axios = Mock.ofType<AxiosHttpClient>();
        const telemetry = Mock.ofType<IExperimentationTelemetry>();
        const axiosError = Mock.ofType<AxiosError<any>>();
        // We need to add this in order to be able to return this object
        // within a promise.
        axiosError.setup((a: any) => a.then).returns(() => undefined);

        // setup
        // 1) Return reject response to simulate unsuccessfull call.
        axios
            .setup((a) => a.get(It.isAny()))
            .returns(() => Promise.reject(axiosError.object))
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
        const tasApiProvider = new TasApiFeatureProvider(axios.object, telemetry.object, []);
        let exceptionThrown = false;
        try {
            await tasApiProvider.fetch();
        } catch (err) {
            expect(err).to.be.an.instanceOf(Error);
            exceptionThrown = true;
            expect((err as Error).message).to.equal(TASAPI_FETCHERROR_EVENTNAME);
        }
        // verify
        axios.verifyAll();
        telemetry.verifyAll();
        // assert exception was thrown.
        expect(exceptionThrown).to.equal(true);
    });

    it('Should send telemetry of type NoResponse when no response was returned from the server but a request exists.', async () => {
        // init
        const axios = Mock.ofType<AxiosHttpClient>();
        const telemetry = Mock.ofType<IExperimentationTelemetry>();
        const axiosError = Mock.ofType<AxiosError<any>>();

        // We need to add this in order to be able to return this object
        // within a promise.
        axiosError.setup((a: any) => a.then).returns(() => undefined);
        // Setup undefined response, so that we use request instead.
        axiosError.setup((e) => e.response).returns(() => undefined);

        // setup
        // 1) Return reject response to simulate unsuccessfull call.
        axios
            .setup((a) => a.get(It.isAny()))
            .returns(() => Promise.reject(axiosError.object))
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
        const tasApiProvider = new TasApiFeatureProvider(axios.object, telemetry.object, []);
        let exceptionThrown = false;
        try {
            await tasApiProvider.fetch();
        } catch (err) {
            expect(err).to.be.an.instanceOf(Error);
            exceptionThrown = true;
            expect((err as Error).message).to.equal(TASAPI_FETCHERROR_EVENTNAME);
        }
        // verify
        axios.verifyAll();
        telemetry.verifyAll();
        // assert exception was thrown.
        expect(exceptionThrown).to.equal(true);
    });

    it('Should send telemetry of type GenericError when no request or response was available in the response.', async () => {
        // init
        const axios = Mock.ofType<AxiosHttpClient>();
        const telemetry = Mock.ofType<IExperimentationTelemetry>();
        const axiosError = Mock.ofType<AxiosError<any>>();
        // We need to add this in order to be able to return this object
        // within a promise.
        axiosError.setup((a: any) => a.then).returns(() => undefined);
        // Setup undefined response and undefined request, so that error is interpreted as generic.
        axiosError.setup((e) => e.response).returns(() => undefined);
        axiosError.setup((e) => e.request).returns(() => undefined);

        // setup
        // 1) Return reject response to simulate unsuccessfull call.
        axios
            .setup((a) => a.get(It.isAny()))
            .returns(() => Promise.reject(axiosError.object))
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
        const tasApiProvider = new TasApiFeatureProvider(axios.object, telemetry.object, []);
        let exceptionThrown = false;
        try {
            await tasApiProvider.fetch();
        } catch (err) {
            expect(err).to.be.an.instanceOf(Error);
            exceptionThrown = true;
            expect((err as Error).message).to.equal(TASAPI_FETCHERROR_EVENTNAME);
        }
        // verify
        axios.verifyAll();
        telemetry.verifyAll();
        // assert exception was thrown.
        expect(exceptionThrown).to.equal(true);
    });
});
