/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, describe, it } from 'vitest';
import { ExperimentationServiceMock } from './mocks/ExperimentationServiceMock.js';
import { BaseFeatureProviderMock, ThrowFeatureProvider } from './mocks/BaseFeatureProviderMock.js';
import { ExperimentationTelemetryMock } from './mocks/ExperimentationTelemetryMock.js';
import { KeyValueStorageMock } from './mocks/KeyValueStorageMock.js';
import { FetchResolver } from './mocks/FetchResolver.js';
import { TasApiFeatureProvider, TAS_CALL_EVENTNAME } from '../src/tas-client/FeatureProvider/TasApiFeatureProvider.js';
import { AssignmentsApiFeatureProvider } from '../src/tas-client/FeatureProvider/AssignmentsApiFeatureProvider.js';
import { ExperimentationFilterProviderOneFilterMock } from './mocks/ExperimentationFilterProviderMock.js';
import { HttpClient } from '../src/tas-client/Util/HttpClient.js';

// Regression: a failing feature provider (e.g. the legacy endpoint erroring) must not
// discard the results of the other providers (e.g. the new assignments endpoint). This
// guards the `Promise.all` -> fault-isolation fix in ExperimentationServiceBase.
describe('Regression: provider fault isolation', () => {
	it('a failing provider does not discard the other providers results', async () => {
		const telemetry = new ExperimentationTelemetryMock();
		const good = new BaseFeatureProviderMock(
			telemetry,
			new FetchResolver({ features: ['good'], assignmentContext: 'ctxGood', configs: [] }),
			10,
		);
		const bad = new ThrowFeatureProvider(10);
		const service = new ExperimentationServiceMock([good, bad], [], 100000, telemetry, new KeyValueStorageMock());

		const enabled = await service.isFlightEnabledAsync('good');

		expect(enabled).to.equal(true);
		expect(telemetry.sharedProperties.get('AssignmentContextTelemetryEventName')).to.equal('ctxGood');
	});

	it('preserves cached features when all providers fail', async () => {
		const telemetry = new ExperimentationTelemetryMock();
		const storage = new KeyValueStorageMock();
		storage.setValue('StorageKey', { features: ['cached'], assignmentContext: 'ctxCached', configs: [] });
		const badA = new ThrowFeatureProvider(10);
		const badB = new ThrowFeatureProvider(10);
		const service = new ExperimentationServiceMock([badA, badB], [], 100000, telemetry, storage);

		// Force a network fetch; every provider rejects.
		await service.isFlightEnabledAsync('cached');

		// Cache must be preserved (not overwritten with an empty set) when no provider succeeds.
		expect(await service.isCachedFlightEnabled('cached')).to.equal(true);
	});
});

// Regression: the custom `fetch` transport hook is used for the legacy endpoint (proxy
// support), and a uniform `tas-call` event is emitted with the call outcome, extension
// name, and the call's own assignment context.
describe('Regression: legacy fetch hook + tas-call telemetry', () => {
	const endpoint = 'https://example.test/tas';

	it('uses the custom fetch hook and posts tas-call Success with assignmentContext', async () => {
		const telemetry = new ExperimentationTelemetryMock();
		let calledUrl: string | undefined;
		let calledMethod: string | undefined;
		const fetchFn = async (url: string, init: { method: 'GET' | 'POST' }) => {
			calledUrl = url;
			calledMethod = init.method;
			return { status: 200, json: async () => ({ Configs: [{ Id: 'test', Parameters: { flightA: true } }], AssignmentContext: 'ctxLegacy' }) };
		};
		const provider = new TasApiFeatureProvider(new HttpClient(endpoint), telemetry, [], endpoint, fetchFn, 'my-ext');

		const data = await provider.fetch();

		expect(calledUrl).to.equal(endpoint);
		expect(calledMethod).to.equal('GET');
		expect(data.assignmentContext).to.equal('ctxLegacy');

		const call = telemetry.postedEvents.find(e => e.eventName === TAS_CALL_EVENTNAME);
		expect(call).to.not.equal(undefined);
		expect(call!.args.get('callType')).to.equal('legacy');
		expect(call!.args.get('outcome')).to.equal('Success');
		expect(call!.args.get('extensionName')).to.equal('my-ext');
		expect(call!.args.get('assignmentContext')).to.equal('ctxLegacy');
	});

	it('posts tas-call with ServerError outcome on a non-2xx response', async () => {
		const telemetry = new ExperimentationTelemetryMock();
		const fetchFn = async () => ({ status: 500, json: async () => ({}) });
		const provider = new TasApiFeatureProvider(new HttpClient(endpoint), telemetry, [], endpoint, fetchFn, 'my-ext');

		await expect(provider.fetch()).rejects.toBeDefined();

		const call = telemetry.postedEvents.find(e => e.eventName === TAS_CALL_EVENTNAME);
		expect(call).to.not.equal(undefined);
		expect(call!.args.get('callType')).to.equal('legacy');
		expect(call!.args.get('outcome')).to.equal('ServerError');
	});
});

// Regression: mirror of the legacy coverage for the new assignments endpoint (POST).
describe('Regression: assignments fetch hook + tas-call telemetry', () => {
	const endpoint = 'https://example.test/assignments';

	it('uses the custom fetch hook and posts tas-call Success with assignmentContext', async () => {
		const telemetry = new ExperimentationTelemetryMock();
		let calledUrl: string | undefined;
		let calledMethod: string | undefined;
		const fetchFn = async (url: string, init: { method: 'GET' | 'POST' }) => {
			calledUrl = url;
			calledMethod = init.method;
			return { status: 200, json: async () => ({ featureVariables: { flagA: 'true' }, assignedVariants: [], dataVersion: 1, assignmentContext: 'ctxAssign' }) };
		};
		const provider = new AssignmentsApiFeatureProvider(new HttpClient(endpoint), telemetry, [new ExperimentationFilterProviderOneFilterMock()], endpoint, fetchFn, 'my-ext');

		const data = await provider.fetch();

		expect(calledUrl).to.equal(endpoint);
		expect(calledMethod).to.equal('POST');
		expect(data.assignmentContext).to.equal('ctxAssign');

		const call = telemetry.postedEvents.find(e => e.eventName === TAS_CALL_EVENTNAME);
		expect(call).to.not.equal(undefined);
		expect(call!.args.get('callType')).to.equal('assignments');
		expect(call!.args.get('outcome')).to.equal('Success');
		expect(call!.args.get('extensionName')).to.equal('my-ext');
		expect(call!.args.get('assignmentContext')).to.equal('ctxAssign');
	});

	it('posts tas-call with ServerError outcome and rejects on a non-2xx response', async () => {
		const telemetry = new ExperimentationTelemetryMock();
		const fetchFn = async () => ({ status: 500, json: async () => ({}) });
		const provider = new AssignmentsApiFeatureProvider(new HttpClient(endpoint), telemetry, [new ExperimentationFilterProviderOneFilterMock()], endpoint, fetchFn, 'my-ext');

		await expect(provider.fetch()).rejects.toBeDefined();

		const call = telemetry.postedEvents.find(e => e.eventName === TAS_CALL_EVENTNAME);
		expect(call).to.not.equal(undefined);
		expect(call!.args.get('callType')).to.equal('assignments');
		expect(call!.args.get('outcome')).to.equal('ServerError');
	});
});
