/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExperimentationService } from '../contracts/IExperimentationService';
import { IExperimentationTelemetry } from '../contracts/IExperimentationTelemetry';
import { IKeyValueStorage } from '../contracts/IKeyValueStorage';
import { IFeatureProvider, FeatureData } from './FeatureProvider/IFeatureProvider';
import { MemoryKeyValueStorage } from './Util/MemoryKeyValueStorage';

/**
 * Experimentation service to provide functionality of A/B experiments:
 * - reading flights;
 * - caching current set of flights;
 * - get answer on if flights are enabled.
 */
export abstract class ExperimentationServiceBase implements IExperimentationService {
    protected featureProviders?: IFeatureProvider[];
    protected fetchPromise?: Promise<FeatureData[]>;
    protected featuresConsumed = false;
    private loadCachePromise: Promise<void>;
    public readonly initializePromise: Promise<void>;
    private resolveInitialFetchPromise: (() => void) | undefined;
    public readonly initialFetch: Promise<void>;

    private cachedTelemetryEvents: string[] = [];
    private _features: FeatureData = {
        features: [],
        assignmentContext: '',
        configs: []
    };
    private get features(): FeatureData {
        return this._features;
    }
    private set features(value: FeatureData) {
        this._features = value;
        /**
         * If an implementation of telemetry exists, we set the shared property.
         */
        if (this.telemetry) {
            this.telemetry.setSharedProperty(this.featuresTelemetryPropertyName, this.features.features.join(';'));
            this.telemetry.setSharedProperty(this.assignmentContextTelemetryPropertyName, this.features.assignmentContext);
        }
    }

    constructor(
        protected telemetry: IExperimentationTelemetry,
        protected featuresTelemetryPropertyName: string,
        protected assignmentContextTelemetryPropertyName: string,
        protected telemetryEventName: string,
        protected storageKey?: string,
        protected storage?: IKeyValueStorage,
    ) {
        if (!this.storageKey) {
            this.storageKey = 'ABExp.Features';
        }

        if (!this.storage) {
            storage = new MemoryKeyValueStorage();
        }

        this.loadCachePromise = this.loadCachedFeatureData();
        this.initializePromise = this.loadCachePromise;
        this.initialFetch = new Promise<void>((resolve, reject) => {
            this.resolveInitialFetchPromise = resolve;
        });
    }

    /**
     * Gets all the features from the provider sources (not cache).
     * It returns these features and will also update the providers to have the latest features cached.
     */
    protected async getFeaturesAsync(overrideInMemoryFeatures = false): Promise<FeatureData> {
        /**
         * If there's already a fetching promise, there's no need to call it again.
         * We return that as result.
         */
        if (this.fetchPromise != null) {
            try {
                await this.fetchPromise;
            } catch {
                // Fetching features threw. Can happen if not connected to the internet, e.g
            }
            return this.features;
        }

        if (!this.featureProviders || this.featureProviders.length === 0) {
            return Promise.resolve({
                features: [],
                assignmentContext: '',
                configs: []
            });
        }

        /**
         * Fetch all from providers.
         */
        this.fetchPromise = Promise.all(
            this.featureProviders.map(async (provider) => {
                return await provider.getFeatures();
            }),
        );

        try {
            const featureResults = await this.fetchPromise;
            this.updateFeatures(featureResults, overrideInMemoryFeatures);
        } catch {
            // Fetching features threw. Can happen if not connected to the internet, e.g.
        }
        
        this.fetchPromise = undefined;

        if (this.resolveInitialFetchPromise) {
            this.resolveInitialFetchPromise();
            this.resolveInitialFetchPromise = undefined;
        }

        /**
         * At this point all features have been re-fetched and cache has been updated.
         * We return the cached features.
         */
        return this.features;
    }

    /**
     *
     * @param featureResults The feature results obtained from all the feature providers.
     */
    protected updateFeatures(featureResults: FeatureData[], overrideInMemoryFeatures = false) {
        /**
         * if features comes as a null value, that is taken as if there aren't any features active,
         * so an empty array is defaulted.
         */
        let features: FeatureData = {
            features: [],
            assignmentContext: '',
            configs: []
        }

        for (let result of featureResults) {
            for (let feature of result.features) {
                if (!features.features.includes(feature)) {
                    features.features.push(feature);
                }
            }
            for (let config of result.configs) {
                const existingConfig = features.configs.find(c => c.Id === config.Id);
                if (existingConfig) {
                    existingConfig.Parameters = { ...existingConfig.Parameters, ...config.Parameters };
                } else {
                    features.configs.push(config);
                }
            }
            features.assignmentContext += result.assignmentContext;
        }

        /**
         * Set the obtained feature values to the global features variable. This stores them in memory.
         */
        if (overrideInMemoryFeatures || !this.featuresConsumed) {
            this.features = features;
        }

        /**
         * If we have storage, we cache the latest results into the storage.
         */
        if (this.storage) {
            this.storage.setValue<FeatureData>(this.storageKey!, features);
        }
    }

    private async loadCachedFeatureData() {
        let cachedFeatureData: FeatureData | undefined;
        if (this.storage) {
            cachedFeatureData = await this.storage.getValue<FeatureData>(this.storageKey!);
            // When updating from an older version of tas-client, configs may be undefined 
            if (cachedFeatureData !== undefined && cachedFeatureData.configs === undefined) {
                cachedFeatureData.configs = [];
            }
        }
        if (this.features.features.length === 0) {
            this.features = cachedFeatureData || { features: [], assignmentContext: '', configs: [] };
        }
    }

    /**
     * Returns a value indicating whether the given flight is enabled.
     * It uses the in-memory cache.
     * @param flight The flight to check.
     */
    public isFlightEnabled(flight: string): boolean {
        this.featuresConsumed = true;
        this.PostEventToTelemetry(flight);
        return this.features.features.includes(flight);
    }

    /**
     * Returns a value indicating whether the given flight is enabled.
     * It uses the values currently on cache.
     * @param flight The flight to check.
     */
    public async isCachedFlightEnabled(flight: string): Promise<boolean> {
        await this.loadCachePromise;
        this.featuresConsumed = true;
        this.PostEventToTelemetry(flight);
        return this.features.features.includes(flight);
    }

    /**
     * Returns a value indicating whether the given flight is enabled.
     * It re-fetches values from the server.
     * @param flight the flight to check.
     */
    public async isFlightEnabledAsync(flight: string): Promise<boolean> {
        const features = await this.getFeaturesAsync(true);
        this.featuresConsumed = true;
        this.PostEventToTelemetry(flight);
        return features.features.includes(flight);
    }

    /**
     * Returns the value of the treatment variable, or undefined if not found.
     * It uses the values currently in memory, so the experimentation service
     * must be initialized before calling.
     * @param config name of the config to check.
     * @param name name of the treatment variable.
     */
    public getTreatmentVariable<T extends boolean | number | string>(configId: string, name: string): T | undefined {
        this.featuresConsumed = true;
        this.PostEventToTelemetry(`${configId}.${name}`);
        const config = this.features.configs.find(c => c.Id === configId);
        return config?.Parameters[name] as T;
    }

    /**
     * Returns the value of the treatment variable, or undefined if not found.
     * It re-fetches values from the server. If checkCache is set to true and the value exists
     * in the cache, the Treatment Assignment Service is not called.
     * @param config name of the config to check.
     * @param name name of the treatment variable.
     * @param checkCache check the cache for the variable before calling the TAS.
     */
    public async getTreatmentVariableAsync<T extends boolean | number | string>(configId: string, name: string, checkCache?: boolean): Promise<T | undefined> {
        if (checkCache) {
            const _featuresConsumed = this.featuresConsumed;
            const cachedValue = this.getTreatmentVariable<T>(configId, name);
            if (cachedValue === undefined) {
                this.featuresConsumed = _featuresConsumed;
            } else {
                return cachedValue;
            }
        }
        await this.getFeaturesAsync(true);
        return this.getTreatmentVariable<T>(configId, name);
    }

    private PostEventToTelemetry(flight: string): void {
        /**
         * If this event has already been posted, we omit from posting it again.
         */
        if (this.cachedTelemetryEvents.includes(flight)) {
            return;
        }
        this.telemetry.postEvent(
            this.telemetryEventName,
            new Map<string, string>([['ABExp.queriedFeature', flight]]),
        );

        /**
         * We cache the flight so we don't post it again.
         */
        this.cachedTelemetryEvents.push(flight);
    }

    protected invokeInit(): void {
        this.init();
    }

    /**
     * Method to do any post-base constructor calls.
     * Consider this a constructor for the derived classes.
     * Can be used to initialize the Feature Providers.
     * No async calls should be done here.
     */
    protected abstract init(): void;

    protected addFeatureProvider(...providers: IFeatureProvider[]) {
        if (providers == null || this.featureProviders == null) {
            return;
        }
        for (let provider of providers) {
            this.featureProviders!.push(provider);
        }
    }
}
