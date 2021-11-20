/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExperimentationFilterProviderTwoFilterMock } from './mocks/ExperimentationFilterProviderMock';
import { expect } from 'chai';
import { FetchResolver } from './mocks/FetchResolver';
import { BaseFeatureProviderMock } from './mocks/BaseFeatureProviderMock';
import { ExperimentationTelemetryMock } from './mocks/ExperimentationTelemetryMock';
import { MockFilteredFeatureProvider } from './mocks/MockFilteredFeatureProvider';

/**
 * For this test we want to ensure the unique capability of a Feature provider, which is to call the fetch method everytime it's called.
 */
describe('Feature Provider tests', () => {
    /**
     * Resolver that is expected to be called three times (two by auto-polling).
     * First time it will return both features.
     * Second time it will return just feature 1.
     * Third time it will return feature 2.
     */
    let resolver = new FetchResolver({ features: ['feature1', 'feature2'], assignmentContext: '', configs: [] },
                                    { features: ['feature1'], assignmentContext: '', configs: [] },
                                    { features: ['feature2'], assignmentContext: '', configs: [] });
    //setup
    let featureProvider: BaseFeatureProviderMock | undefined = new BaseFeatureProviderMock(
        new ExperimentationTelemetryMock(),
        resolver,
    );

    /**
     * A feature provider will be started by calling the getFeatures method.
     * This will retrieve the first set of data.
     * Consecuentially, all other getFeatures that are called, will re-fectch, as a feature provider does not hold cache.
     */
    it('Feature provider should always run fetch whenever features are accessed. They do not hold cache.', async () => {
        //evaluate
        let features = await featureProvider!.getFeatures();
        expect(features.features).to.eql(['feature1', 'feature2']);

        features = await featureProvider!.getFeatures();
        expect(features.features).to.eql(['feature1']);

        features = await featureProvider!.getFeatures();
        expect(features.features).to.eql(['feature2']);
    });

    it('Feature provider should post headers to telemetry.', async () => {
        const telemetryMock = new ExperimentationTelemetryMock();
        const filteredFeatureProvider = new MockFilteredFeatureProvider(
            telemetryMock,
            [new ExperimentationFilterProviderTwoFilterMock()]
        );

        // In the fetch method we're posting the headers.
        await filteredFeatureProvider.fetch();

        expect(telemetryMock.postedEvents.length).to.be.greaterThan(0);
        const postedEvent = telemetryMock.postedEvents[0];
        const postedEventArgs = postedEvent.args.get('ABExp.headers');
        expect(postedEventArgs).to.be.equal('{"lucario":true,"wario":false}');
    });
});
