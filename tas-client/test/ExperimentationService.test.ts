/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, describe, it } from 'vitest';
import {
    ExperimentationServiceMock,
    FeatureProviderTestSpec,
} from './mocks/ExperimentationServiceMock';
import { FetchResolver } from './mocks/FetchResolver';
import { FilteredExperimentationServiceMock } from './mocks/FilteredExperimentationServiceMock';
import {
    ExperimentationFilterProviderOneFilterMock,
    ExperimentationFilterProviderTwoFilterMock,
} from './mocks/ExperimentationFilterProviderMock';
import { ExperimentationTelemetryMock } from './mocks/ExperimentationTelemetryMock';
import { KeyValueStorageMock } from './mocks/KeyValueStorageMock';
import { FeatureData } from '../src/tas-client/FeatureProvider/IFeatureProvider';
import { ThrowFeatureProvider } from './mocks/BaseFeatureProviderMock';

/**
 * Multiple feature providers.
 * Scenarios covered:
 * 1) An Experimentation Service Provider that has more than 1 Feature Provider.
 * 2) These feature providers have different fetch durations. The current architecture has a bottleneck in this part, in a way that
 *    re-fetching will always take as long as the slowest of the members.
 * 3) Data obtained from the feature providers changes on each call (three different results).
 * 4) In these differences features get added, deleted, and unchanged. (sometimes both)
 * 5) In the updates, some providers provide repeated feature ids.
 * 6) In these updates, sometimes features get deleted in a provider, but added in another one (so they're not fully deleted.)
 */
describe('Get features from multiple providers that differ in polling intervals and fetch delay.', () => {

    let prepopulatedTestSpecs: FeatureProviderTestSpec[] = [
        {
            fetchDelay: 200,
            fetchResolver: new FetchResolver(
                { features: ['kirby', 'falco', 'fox', 'joker'], assignmentContext: '', configs: [ { Id: 'test', Parameters: { 'character1': 'kirby', 'hp1': 20 }}] }
            ),
        },
        {
            fetchDelay: 50,
            fetchResolver: new FetchResolver(
                { features: ['lucario', 'kirby', 'ness'], assignmentContext: '', configs: [ { Id: 'test', Parameters: { 'character2': 'lucario', 'hp2': 50 }}] }
            ),
        },
        {
            fetchDelay: 100,
            fetchResolver: new FetchResolver(
                { features: ['mario', 'kingdedede', 'lucario'], assignmentContext: '', configs: [ { Id: 'test2', Parameters: { 'character1': 'mario', 'hp1': 40 }}] }
            ),
        },
    ]
    let prepopulatedStorage = new KeyValueStorageMock();
    prepopulatedStorage.setValue<FeatureData>('StorageKey', { features: ['initial'], assignmentContext: '', configs: [ { Id: 'test', Parameters: { 'foo': 42 } }] });
    let prepopulatedService: ExperimentationServiceMock | undefined; 

    // isCachedFlightEnabled called before any polling should return
    // the initial cache contents.
    it('isCachedFlightEnabled should return cached features.', async () => {
        prepopulatedService = new ExperimentationServiceMock([], prepopulatedTestSpecs, 1000, undefined, prepopulatedStorage);
        let initial = await prepopulatedService.isCachedFlightEnabled('initial');

        expect(initial).to.equal(true);
    });

    // getTreatmentVariable called before any polling should return
    // the initial cache contents.
    it('getTreatmentVariable should return cached treatment variables.', async () => {
        await prepopulatedService!.initializePromise;
        let initialConfig = prepopulatedService!.getTreatmentVariable<number>('test', 'foo');

        expect(initialConfig).to.equal(42);
    });

    // After the first poll, isCachedFlightEnabled should still return the initial
    // feature set to avoid changing flights mid-session due to a background poll.
    it('background poll should not change in memory features.', async () => {
        // Wait for the experimentation service to do an initial poll.
        await new Promise<void>((resolve) => {
            setTimeout(() => resolve(), 200);
        });

        let initial = await prepopulatedService!.isCachedFlightEnabled('initial');
        let kirby = await prepopulatedService!.isCachedFlightEnabled('kirby');
        let falco = await prepopulatedService!.isCachedFlightEnabled('falco');
        let fox = await prepopulatedService!.isCachedFlightEnabled('fox');
        let joker = await prepopulatedService!.isCachedFlightEnabled('joker');
        let lucario = await prepopulatedService!.isCachedFlightEnabled('lucario');
        let ness = await prepopulatedService!.isCachedFlightEnabled('ness');
        let mario = await prepopulatedService!.isCachedFlightEnabled('mario');
        let kingdedede = await prepopulatedService!.isCachedFlightEnabled('kingdedede');

        expect(initial).to.equal(true);
        expect(kirby).to.equal(false);
        expect(falco).to.equal(false);
        expect(fox).to.equal(false);
        expect(joker).to.equal(false);
        expect(lucario).to.equal(false);
        expect(ness).to.equal(false);
        expect(mario).to.equal(false);
        expect(kingdedede).to.equal(false);
    });

    // After the first poll, getTreatmentVariable should still return the initial
    // config to avoid changing variables mid-session due to a background poll.
    it('background poll should not change in memory variables.', async () => {
        await prepopulatedService!.initializePromise;

        let testCharacter1 = prepopulatedService!.getTreatmentVariable<string>('test', 'character1');
        let testHP1 = prepopulatedService!.getTreatmentVariable<number>('test', 'hp1');
        let testCharacter2 = prepopulatedService!.getTreatmentVariable<string>('test', 'character2');
        let testHP2 = prepopulatedService!.getTreatmentVariable<number>('test', 'hp2');
        let test2Character1 = prepopulatedService!.getTreatmentVariable<string>('test2', 'character1');
        let test2HP1 = prepopulatedService!.getTreatmentVariable<number>('test2', 'hp1');

        expect(testCharacter1).to.equal(undefined);
        expect(testHP1).to.equal(undefined);
        expect(testCharacter2).to.equal(undefined);
        expect(testHP2).to.equal(undefined);
        expect(test2Character1).to.equal(undefined);
        expect(test2HP1).to.equal(undefined);
    });

    let prepopulatedService2: ExperimentationServiceMock | undefined;

    // This test simulates starting a new session with the cache from the previous session.
    // Now a call to isCachedFlightEnables should return the features from the first result set.
    it('new session should have polled features from previous session in cache.', async () => {
        prepopulatedService2 = new ExperimentationServiceMock([], prepopulatedTestSpecs, 1000, undefined, prepopulatedStorage);

        let initial = await prepopulatedService2.isCachedFlightEnabled('initial');
        let kirby = await prepopulatedService2.isCachedFlightEnabled('kirby');
        let falco = await prepopulatedService2.isCachedFlightEnabled('falco');
        let fox = await prepopulatedService2.isCachedFlightEnabled('fox');
        let joker = await prepopulatedService2.isCachedFlightEnabled('joker');
        let lucario = await prepopulatedService2.isCachedFlightEnabled('lucario');
        let ness = await prepopulatedService2.isCachedFlightEnabled('ness');
        let mario = await prepopulatedService2.isCachedFlightEnabled('mario');
        let kingdedede = await prepopulatedService2.isCachedFlightEnabled('kingdedede');

        expect(initial).to.equal(false);
        expect(kirby).to.equal(true);
        expect(falco).to.equal(true);
        expect(fox).to.equal(true);
        expect(joker).to.equal(true);
        expect(lucario).to.equal(true);
        expect(ness).to.equal(true);
        expect(mario).to.equal(true);
        expect(kingdedede).to.equal(true);
    });

    // This test simulates starting a new session with the cache from the previous session.
    // Now a call to getTreatmentVariable should return the configs from the first result set.
    it('new session should have polled configs from previous session in cache.', async () => {
        await prepopulatedService2!.initializePromise;

        let testCharacter1 = prepopulatedService2!.getTreatmentVariable<string>('test', 'character1');
        let testHP1 = prepopulatedService2!.getTreatmentVariable<number>('test', 'hp1');
        let testCharacter2 = prepopulatedService2!.getTreatmentVariable<string>('test', 'character2');
        let testHP2 = prepopulatedService2!.getTreatmentVariable<number>('test', 'hp2');
        let test2Character1 = prepopulatedService2!.getTreatmentVariable<string>('test2', 'character1');
        let test2HP1 = prepopulatedService2!.getTreatmentVariable<number>('test2', 'hp1');

        expect(testCharacter1).to.equal('kirby');
        expect(testHP1).to.equal(20);
        expect(testCharacter2).to.equal('lucario');
        expect(testHP2).to.equal(50);
        expect(test2Character1).to.equal('mario');
        expect(test2HP1).to.equal(40);
    });

    let testSpecs: FeatureProviderTestSpec[] = [
        {
            fetchDelay: 200,
            fetchResolver: new FetchResolver(
                { features: ['kirby', 'falco', 'fox', 'joker'], assignmentContext: '', configs: [ { Id: 'test', Parameters: { 'character1': 'kirby', 'hp1': 20 }}] }, // First fetch will return this array.
                { features: ['joker', 'palutena', 'fox'], assignmentContext: '', configs: [ { Id: 'test', Parameters: { 'character1': 'joker', 'hp1': 40 }}] }, // second fetch will return this array.
                { features: ['falco'], assignmentContext: '', configs: [ { Id: 'test', Parameters: { 'character1': 'falco', 'hp1': 30 }}] }, // third fetch will return this array.
            ),
        },
        {
            fetchDelay: 50,
            fetchResolver: new FetchResolver(
                { features: ['lucario', 'kirby', 'ness'], assignmentContext: '', configs: [ { Id: 'test', Parameters: { 'character2': 'lucario', 'isPink': false }}] }, // First fetch will return this array.
                { features: ['kirby'], assignmentContext: '', configs: [ { Id: 'test', Parameters: { 'character2': 'kirby', 'isPink': true }}] }, // Second fetch will return this array.
                { features: ['kirby'], assignmentContext: '', configs: [ { Id: 'test', Parameters: { 'character2': 'kirby', 'isPink': true }}] }, // Third fetch will return this array.
            ),
        },
        {
            fetchDelay: 100,
            fetchResolver: new FetchResolver(
                { features: ['mario', 'kingdedede', 'lucario'], assignmentContext: '', configs: [ { Id: 'test', Parameters: { 'character3': 'mario', 'hp3': 40 }}] }, // First fetch will return this array.
                { features: ['falco', 'ness', 'mario', 'lucario', 'kingdedede'], assignmentContext: '', configs: [ { Id: 'test', Parameters: { 'character3': 'falco', 'hp3': 2 }}] }, // Second fetch will return this array.
                { features: ['ness', 'mario', 'lucario', 'ike'], assignmentContext: '', configs: [ { Id: 'test', Parameters: { 'character3': 'ness', 'hp3': 80 }}] }// Third fetch will return this array.
            ),
        },
    ];

    let storage = new KeyValueStorageMock();
    let service: ExperimentationServiceMock;

    // The current result will be:
    // ['kirby', 'falco', 'fox', 'joker'] from provider 1
    // ['lucario', 'kirby', 'ness'] from provider 2
    // ['mario', 'kingdedede', 'lucario'] from provider 3
    // it's total 10 but we subtract two because kirby and lucario are repeated.
    it('should fetch elements from all providers, and save them to cache.', async () => {
        service = new ExperimentationServiceMock([], testSpecs, 1000, undefined, storage);
        // Wait for the experimentation service to do an initial poll
        // so we can check the cached features.
        await new Promise<void>((resolve) => {
            setTimeout(() => resolve(), 400);
        });

        // No need to call isFlightEnabledAsync because the ExperimentationService should
        // request features from providers on start.
        let kirby = await service.isCachedFlightEnabled('kirby');
        let falco = await service.isCachedFlightEnabled('falco');
        let fox = await service.isCachedFlightEnabled('fox');
        let joker = await service.isCachedFlightEnabled('joker');
        let lucario = await service.isCachedFlightEnabled('lucario');
        let ness = await service.isCachedFlightEnabled('ness');
        let mario = await service.isCachedFlightEnabled('mario');
        let kingdedede = await service.isCachedFlightEnabled('kingdedede');

        // validate that all the correct elements are inside the array.
        expect(kirby).to.equal(true);
        expect(falco).to.equal(true);
        expect(fox).to.equal(true);
        expect(joker).to.equal(true);
        expect(lucario).to.equal(true);
        expect(ness).to.equal(true);
        expect(mario).to.equal(true);
        expect(kingdedede).to.equal(true);
    });

    it('should fetch configs from all providers, and save them to cache.', async () => {
        await service.initializePromise;

        // No need to call getTreatmentVariableAsync because the ExperimentationService should
        // request configs from providers on start.
        let character1 = service.getTreatmentVariable<string>('test', 'character1');
        let hp1 = service.getTreatmentVariable<number>('test', 'hp1');
        let character2 = service.getTreatmentVariable<string>('test', 'character2');
        let isPink = service.getTreatmentVariable<boolean>('test', 'isPink');
        let character3 = service.getTreatmentVariable<string>('test', 'character3');
        let hp3 = service.getTreatmentVariable<number>('test', 'hp3');

        expect(character1).to.equal('kirby');
        expect(hp1).to.equal(20);
        expect(character2).to.equal('lucario');
        expect(isPink).to.equal(false);
        expect(character3).to.equal('mario');
        expect(hp3).to.equal(40);
    });

    // The second result should be:
    // ['joker', 'palutena', 'fox'] from provider 1 +
    // ['kirby'] from provider 2 +
    // ['falco', 'ness', 'mario', 'lucario', 'kingdedede'] from provider 3
    it('should update the cache (and reset the polling clock) if isFlightEnabledAsync is called again.', async () => {
        // Calling isFlightEnabledAsync will ovverride the previously
        // fetched features.
        let joker = await service.isFlightEnabledAsync('joker');
        let palutena = await service.isCachedFlightEnabled('palutena');
        let fox = await service.isCachedFlightEnabled('fox');
        let kirby = await service.isCachedFlightEnabled('kirby');
        let falco = await service.isCachedFlightEnabled('falco');
        let ness = await service.isCachedFlightEnabled('ness');
        let mario = await service.isCachedFlightEnabled('mario');
        let lucario = await service.isCachedFlightEnabled('lucario');
        let kingdedede = await service.isCachedFlightEnabled('kingdedede');

        // validate that all the correct elements are inside the array.
        expect(joker).to.equal(true);
        expect(palutena).to.equal(true);
        expect(fox).to.equal(true);
        expect(kirby).to.equal(true);
        expect(falco).to.equal(true);
        expect(ness).to.equal(true);
        expect(mario).to.equal(true);
        expect(lucario).to.equal(true);
        expect(kingdedede).to.equal(true);
    });

    it('should update the cached configs (and reset the polling clock) if isFlightEnabledAsync is called again.', async () => {
        let character1 = service.getTreatmentVariable<string>('test', 'character1');
        let hp1 = service.getTreatmentVariable<number>('test', 'hp1');
        let character2 = service.getTreatmentVariable<string>('test', 'character2');
        let isPink = service.getTreatmentVariable<boolean>('test', 'isPink');
        let character3 = service.getTreatmentVariable<string>('test', 'character3');
        let hp3 = service.getTreatmentVariable<number>('test', 'hp3');

        expect(character1).to.equal('joker');
        expect(hp1).to.equal(40);
        expect(character2).to.equal('kirby');
        expect(isPink).to.equal(true);
        expect(character3).to.equal('falco');
        expect(hp3).to.equal(2);
    });

    // Third result should be: ['ness', 'mario', 'lucario', 'ike', 'kirby', 'falco']
    it('should automatically refetch the third result and update cache.', async () => {
        await new Promise<void>((resolve) => {
            setTimeout(() => resolve(), 1500); // 1200 ms, because it takes 1000 ms to do the polling, and 200ms to complete the fetch, + 300ms buffer.
        });

        let features = await storage.getValue<FeatureData>('StorageKey');

        // No need to call IsFlightEnabledAsync this time, as flights were updated via polling.
        // However, the changes should only be in the cache, not in memory. We don't want to 
        // change flight info mid-session due to a background poll.
        let ness = features!.features.indexOf('ness') >= 0;
        let mario = features!.features.indexOf('mario') >= 0;
        let lucario = features!.features.indexOf('lucario') >= 0;
        let ike = features!.features.indexOf('ike') >= 0;
        let kirby = features!.features.indexOf('kirby') >= 0;
        let falco = features!.features.indexOf('falco') >= 0;

        // validate that all the correct elements are inside the array.
        expect(ness).to.equal(true);
        expect(mario).to.equal(true);
        expect(lucario).to.equal(true);
        expect(ike).to.equal(true);
        expect(kirby).to.equal(true);
        expect(falco).to.equal(true);
    });

    it('should automatically refetch the third result and update cached config.', async () => {
        let features = await storage.getValue<FeatureData>('StorageKey');

        expect(features!.configs).toEqual([{ Id: 'test', Parameters: { character1: 'falco', hp1: 30, character2: 'kirby', isPink: true, character3: 'ness', hp3: 80 } }]);
    });

    // Third result should be: ['ness', 'mario', 'lucario', 'ike', 'kirby', 'falco'], however, because it was
    // due to a background poll, it shouldn't update the in memory features. The in memory features
    // should match those from the second result.
    it('background poll should not update in memory features.', async () => {
        // The changes from the background poll should only be in the cache, not in memory. We don't want to 
        // change flight info mid-session due to a background poll.
        let joker = await service.isCachedFlightEnabled('joker');
        let palutena = await service.isCachedFlightEnabled('palutena');
        let fox = await service.isCachedFlightEnabled('fox');
        let kirby = await service.isCachedFlightEnabled('kirby');
        let falco = await service.isCachedFlightEnabled('falco');
        let ness = await service.isCachedFlightEnabled('ness');
        let mario = await service.isCachedFlightEnabled('mario');
        let lucario = await service.isCachedFlightEnabled('lucario');
        let kingdedede = await service.isCachedFlightEnabled('kingdedede');

        // validate that all the correct elements are inside the array.
        expect(joker).to.equal(true);
        expect(palutena).to.equal(true);
        expect(fox).to.equal(true);
        expect(kirby).to.equal(true);
        expect(falco).to.equal(true);
        expect(ness).to.equal(true);
        expect(mario).to.equal(true);
        expect(lucario).to.equal(true);
        expect(kingdedede).to.equal(true);
    });

    it('background poll should not update in memory configs.', async () => {
        // The changes from the background poll should only be in the cache, not in memory. We don't want to 
        // change variables mid-session due to a background poll.
        let character1 = service.getTreatmentVariable<string>('test', 'character1');
        let hp1 = service.getTreatmentVariable<number>('test', 'hp1');
        let character2 = service.getTreatmentVariable<string>('test', 'character2');
        let isPink = service.getTreatmentVariable<boolean>('test', 'isPink');
        let character3 = service.getTreatmentVariable<string>('test', 'character3');
        let hp3 = service.getTreatmentVariable<number>('test', 'hp3');

        expect(character1).to.equal('joker');
        expect(hp1).to.equal(40);
        expect(character2).to.equal('kirby');
        expect(isPink).to.equal(true);
        expect(character3).to.equal('falco');
        expect(hp3).to.equal(2);
    });
});

describe('Experimentation Service general tests', () => {
    it('should throw if Ms are less than 1000 and different from 0', () => {
        expect(
            () =>
                new ExperimentationServiceMock(
                    [], [{ fetchDelay: 200, fetchResolver: new FetchResolver({ features: ['result'], assignmentContext: '', configs: [] }) }],
                    500,
                ),
        ).toThrow();
    });

    it('should combine filters from filter providers', async () => {
        let service = new FilteredExperimentationServiceMock([
            new ExperimentationFilterProviderOneFilterMock(),
            new ExperimentationFilterProviderTwoFilterMock(),
        ]);
        service.isFlightEnabledAsync('anyflight');
        let filters = service.featureProvider!.lastFilters!;
        expect(filters.size).to.equal(3);
    });
});

describe('Telemetry tests', () => {
    it('Shared properties should be set on isCachedFlightEnabled', async () => {
        const experimentationTelemetryMock = new ExperimentationTelemetryMock();
        const keyValueStorageMock = new KeyValueStorageMock();
        keyValueStorageMock.setValue<FeatureData>('StorageKey', { features: ['testFlight'], assignmentContext: 'tf', configs: [] });
        const service = new ExperimentationServiceMock([], [], 10000, experimentationTelemetryMock, keyValueStorageMock);

        await service.isCachedFlightEnabled('testFlight');

        expect('tf').to.equal(experimentationTelemetryMock.sharedProperties.get('AssignmentContextTelemetryEventName'));
        expect('tf').to.equal(experimentationTelemetryMock.postedEvents[0].sharedProperties.get('AssignmentContextTelemetryEventName'));
    });
});

describe('Auto-polling disabled test', () => {
    let testSpecs: FeatureProviderTestSpec[] = [
        {
            fetchDelay: 200,
            fetchResolver: new FetchResolver(
                { features: ['kirby', 'falco', 'fox', 'joker'], assignmentContext: '', configs: [ { Id: 'test', Parameters: { 'character1': 'kirby', 'hp1': 20 }}] }, // First fetch will return this array.
                { features: ['joker', 'palutena', 'fox'], assignmentContext: '', configs: [ { Id: 'test', Parameters: { 'character1': 'joker', 'hp1': 40 }}] }, // second fetch will return this array.
                { features: ['falco'], assignmentContext: '', configs: [ { Id: 'test', Parameters: { 'character1': 'falco', 'hp1': 30 }}] }, // third fetch will return this array.
            ),
        },
        {
            fetchDelay: 50,
            fetchResolver: new FetchResolver(
                { features: ['lucario', 'kirby', 'ness'], assignmentContext: '', configs: [ { Id: 'test', Parameters: { 'character2': 'lucario', 'isPink': false }}] }, // First fetch will return this array.
                { features: ['kirby'], assignmentContext: '', configs: [ { Id: 'test', Parameters: { 'character2': 'kirby', 'isPink': true }}] }, // Second fetch will return this array.
                { features: ['kirby'], assignmentContext: '', configs: [ { Id: 'test', Parameters: { 'character2': 'kirby', 'isPink': true }}] }, // Third fetch will return this array.
            ),
        },
        {
            fetchDelay: 100,
            fetchResolver: new FetchResolver(
                { features: ['mario', 'kingdedede', 'lucario'], assignmentContext: '', configs: [ { Id: 'test', Parameters: { 'character3': 'mario', 'hp3': 40 }}] }, // First fetch will return this array.
                { features: ['falco', 'ness', 'mario', 'lucario', 'kingdedede'], assignmentContext: '', configs: [ { Id: 'test', Parameters: { 'character3': 'falco', 'hp3': 2 }}] }, // Second fetch will return this array.
                { features: ['ness', 'mario', 'lucario', 'ike'], assignmentContext: '', configs: [ { Id: 'test', Parameters: { 'character3': 'ness', 'hp3': 80 }}] }// Third fetch will return this array.
            ),
        },
    ];
    
    // The current result will be:
    // ['kirby', 'falco', 'fox', 'joker'] from provider 1
    // ['lucario', 'kirby', 'ness'] from provider 2
    // ['mario', 'kingdedede', 'lucario'] from provider 3
    // it's total 10 but we subtract two because kirby and lucario are repeated.
    it('should fetch elements from all providers with no autopolling, and save them to cache.', async () => {
        let storage = new KeyValueStorageMock();
        let service = new ExperimentationServiceMock([], testSpecs, 0, undefined, storage);
        // Wait for the experimentation service to do an initial poll
        // so we can check the cached features.
        await new Promise<void>((resolve) => {
            setTimeout(() => resolve(), 400);
        });

        // No need to call isFlightEnabledAsync because the ExperimentationService should
        // request features from providers on start.
        let kirby = await service.isCachedFlightEnabled('kirby');
        let falco = await service.isCachedFlightEnabled('falco');
        let fox = await service.isCachedFlightEnabled('fox');
        let joker = await service.isCachedFlightEnabled('joker');
        let lucario = await service.isCachedFlightEnabled('lucario');
        let ness = await service.isCachedFlightEnabled('ness');
        let mario = await service.isCachedFlightEnabled('mario');
        let kingdedede = await service.isCachedFlightEnabled('kingdedede');

        // validate that all the correct elements are inside the array.
        expect(kirby).to.equal(true);
        expect(falco).to.equal(true);
        expect(fox).to.equal(true);
        expect(joker).to.equal(true);
        expect(lucario).to.equal(true);
        expect(ness).to.equal(true);
        expect(mario).to.equal(true);
        expect(kingdedede).to.equal(true);
    });
});

describe('Await initial fetch tests', () => {
    const testSpecs: FeatureProviderTestSpec[] = [
        {
            fetchDelay: 200,
            fetchResolver: new FetchResolver(
                { features: ['kirby'], assignmentContext: '', configs: [{ Id: 'test', Parameters: { 'character1': 'kirby', 'hp1': 20 } }] }
            )
        }
    ];

    it('should resolve and update in memory features when initial fetch completes.', async () => {
        const storage = new KeyValueStorageMock();
        const service = new ExperimentationServiceMock([], testSpecs, 0, undefined, storage);

        await service.initialFetch;
        const kirby = service.getTreatmentVariable<string>('test', 'character1');

        expect(kirby).to.equal('kirby');
    });

    it('should resolve and update in memory features when complete.', async () => {
        const storage = new KeyValueStorageMock();
        const service = new ExperimentationServiceMock([], testSpecs, 0, undefined, storage);

        await service.initializePromise;
        const kirby = await service.getTreatmentVariableAsync<string>('test', 'character1', true);

        expect(kirby).to.equal('kirby');
    });

    it('should resolve if feature provider throws.', async () => {
        const storage = new KeyValueStorageMock();
        const service = new ExperimentationServiceMock([new ThrowFeatureProvider()], [], 0, undefined, storage);

        await service.initialFetch;

        expect(true).to.equal(true);
    });

    it('getTreatmentVariableAsync should resolve if feature provider throws.', async () => {
        const storage = new KeyValueStorageMock();
        const service = new ExperimentationServiceMock([new ThrowFeatureProvider()], [], 0, undefined, storage);

        await service.initializePromise;
        const value = await service.getTreatmentVariableAsync('test', 'character1');

        expect(value).to.equal(undefined);
    });

    it('should not override in memory feature data if already consumed.', async () => {
        const storage = new KeyValueStorageMock();
        const service = new ExperimentationServiceMock([], testSpecs, 0, undefined, storage);

        const kirbyPre = service.getTreatmentVariable<string>('test', 'character1');
        await service.initialFetch;
        const kirbyPost = service.getTreatmentVariable<string>('test', 'character1');

        expect(kirbyPre).to.equal(undefined);
        expect(kirbyPost).to.equal(undefined);
    });

    it('should return without waiting for fetch if variable in cache.', async () => {
        const storage = new KeyValueStorageMock();
        storage.setValue<FeatureData>('StorageKey', { features: [], assignmentContext: '', configs: [{ Id: 'test', Parameters: { character1: 'falco' } }] });
        const service = new ExperimentationServiceMock([], testSpecs, 0, undefined, storage);

        await service.initializePromise;
        const falcoPre = await service.getTreatmentVariableAsync<string>('test', 'character1', true);
        await service.initialFetch;
        const falcoPost = service.getTreatmentVariable<string>('test', 'character1');
        const kirby = (await storage.getValue<FeatureData>('StorageKey'))?.configs[0].Parameters.character1;

        expect(falcoPre).to.equal('falco');
        expect(falcoPost).to.equal('falco');
        expect(kirby).to.equal('kirby');
    });

    it('should return without waiting for fetch if variable in cache, even if cache value falsey.', async () => {
        const storage = new KeyValueStorageMock();
        storage.setValue<FeatureData>('StorageKey', { features: [], assignmentContext: '', configs: [{ Id: 'test', Parameters: { character1: false } }] });
        const service = new ExperimentationServiceMock([], testSpecs, 0, undefined, storage);

        await service.initializePromise;
        const characterPre = await service.getTreatmentVariableAsync<string>('test', 'character1', true);
        await service.initialFetch;
        const characterPost = service.getTreatmentVariable<string>('test', 'character1');
        const kirby = (await storage.getValue<FeatureData>('StorageKey'))?.configs[0].Parameters.character1;

        expect(characterPre).to.equal(false);
        expect(characterPost).to.equal(false);
        expect(kirby).to.equal('kirby');
    });

});

/** Other possible tests to do: */
//- Test wether the promise for fetch is re-used.
//- Test that intervals stop when update is force requested, and starts once it finishes.
//- Test that intervals work individually.
