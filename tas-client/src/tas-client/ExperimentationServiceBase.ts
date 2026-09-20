/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    IExperimentationService,
    ITreatmentWithExposure,
} from '../contracts/IExperimentationService.js';
import { IExperimentationTelemetry } from '../contracts/IExperimentationTelemetry.js';
import { IKeyValueStorage } from '../contracts/IKeyValueStorage.js';
import { DeferredAssignmentContext } from '../contracts/ExperimentationServiceConfig.js';
import {
    IFeatureProvider,
    FeatureData,
    DeferredAssignmentContextData,
} from './FeatureProvider/IFeatureProvider.js';
import { MemoryKeyValueStorage } from './Util/MemoryKeyValueStorage.js';

/**
 * Experimentation service to provide functionality of A/B experiments:
 * - reading flights;
 * - caching current set of flights;
 * - get answer on if flights are enabled.
 */
export abstract class ExperimentationServiceBase implements IExperimentationService {
    protected featureProviders?: IFeatureProvider[];
    protected fetchPromise?: Promise<(FeatureData | undefined)[]>;
    protected featuresConsumed = false;
    private loadCachePromise: Promise<void>;
    public readonly initializePromise: Promise<void>;
    private resolveInitialFetchPromise: (() => void) | undefined;
    public readonly initialFetch: Promise<void>;

    private cacheLoaded = false;
    private disposed = false;
    private assignmentContextPublished = false;
    private readonly releasedAssignmentContexts = new Set<string>();
    protected readonly deferredAssignmentContexts: readonly DeferredAssignmentContext[];
    private cachedTelemetryEvents: string[] = [];
    private _features: FeatureData = {
        features: [],
        assignmentContext: '',
        configs: [],
    };
    private get features(): FeatureData {
        return this._features;
    }
    private set features(value: FeatureData) {
        this._features = value;
        this.publishAssignmentContext();
    }

    private publishAssignmentContext(): void {
        if (this.telemetry) {
            const deferred = new Set(
                this.getDeferredAssignmentContexts(this.features).flatMap(
                    (entry) => entry.assignmentContexts,
                ),
            );
            const context = this.features.assignmentContext
                .split(';')
                .filter(
                    (assignment) =>
                        !deferred.has(assignment) ||
                        this.releasedAssignmentContexts.has(assignment),
                )
                .join(';');
            this.assignmentContextPublished = false;
            this.telemetry.setSharedProperty(this.assignmentContextTelemetryPropertyName, context);
            this.assignmentContextPublished = true;
        }
    }

    constructor(
        protected telemetry: IExperimentationTelemetry,
        protected assignmentContextTelemetryPropertyName: string,
        protected telemetryEventName: string,
        protected storageKey?: string,
        protected storage?: IKeyValueStorage,
        deferredAssignmentContexts: readonly DeferredAssignmentContext[] = [],
    ) {
        for (const { configId, name } of deferredAssignmentContexts) {
            if (!configId || !name) {
                throw new Error(
                    'Deferred assignment contexts require a config id and variable name.',
                );
            }
        }
        this.deferredAssignmentContexts = deferredAssignmentContexts.map(({ configId, name }) => ({
            configId,
            name,
        }));
        if (!this.storageKey) {
            this.storageKey = 'ABExp.Features';
        }

        if (!this.storage) {
            this.storage = new MemoryKeyValueStorage();
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
        if (this.deferredAssignmentContexts.length > 0) {
            await this.loadCachePromise;
        }
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
                configs: [],
            });
        }

        try {
            /**
             * Fetch all from providers. Provider failures are isolated so that one provider
             * (e.g. the legacy TAS endpoint) rejecting cannot discard the results of the
             * others (e.g. the new assignments endpoint). A provider that fails contributes
             * `undefined` and is skipped during the merge.
             */
            this.fetchPromise = Promise.all(
                this.featureProviders.map((provider) =>
                    provider.getFeatures().then(
                        (data) => data,
                        () => undefined,
                    ),
                ),
            );
            const featureResults = await this.fetchPromise;
            const successfulResults = featureResults.filter(
                (result): result is FeatureData => result !== undefined,
            );
            // Only update when at least one provider succeeded, so a total failure keeps
            // the previously cached features instead of clobbering them with empty data.
            if (successfulResults.length > 0) {
                this.updateFeatures(successfulResults, overrideInMemoryFeatures);
            }
        } catch {
            // Fetching features threw error. Can happen if not connected to the internet, e.g.
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
            configs: [],
        };
        if (this.deferredAssignmentContexts.length > 0) {
            features.deferredAssignmentContexts = this.deferredAssignmentContexts.map((entry) => ({
                ...entry,
                assignmentContexts: [],
                treatmentAssignmentContexts: [],
            }));
        }

        for (let result of featureResults) {
            // Keep each value paired with its own provider's companion, even after merging.
            for (const entry of this.getDeferredAssignmentContexts(result)) {
                const target = features.deferredAssignmentContexts!.find(
                    (candidate) =>
                        candidate.configId === entry.configId && candidate.name === entry.name,
                )!;
                for (const assignment of entry.assignmentContexts) {
                    if (!target.assignmentContexts.includes(assignment)) {
                        target.assignmentContexts.push(assignment);
                    }
                }
                if (
                    result.configs.find((config) => config.Id === entry.configId)?.Parameters[
                        entry.name
                    ] !== undefined
                ) {
                    target.contextId = entry.contextId;
                    target.treatmentAssignmentContexts = [...entry.treatmentAssignmentContexts];
                }
            }
            for (let feature of result.features) {
                if (!features.features.includes(feature)) {
                    features.features.push(feature);
                }
            }
            for (let config of result.configs) {
                const existingConfig = features.configs.find((c) => c.Id === config.Id);
                if (existingConfig) {
                    existingConfig.Parameters = {
                        ...existingConfig.Parameters,
                        ...config.Parameters,
                    };
                } else {
                    features.configs.push({ Id: config.Id, Parameters: { ...config.Parameters } });
                }
            }
            if (result.assignmentContext) {
                // Join contexts from multiple providers with a ';' so downstream consumers
                // that split on ';' do not merge two providers' segments into one token.
                if (features.assignmentContext && !features.assignmentContext.endsWith(';')) {
                    features.assignmentContext += ';';
                }
                features.assignmentContext += result.assignmentContext;
            }
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
            const [cached, released] = await Promise.all([
                this.storage.getValue<FeatureData>(this.storageKey!),
                this.deferredAssignmentContexts.length > 0
                    ? this.storage.getValue<string[]>(this.releasedAssignmentContextsStorageKey)
                    : undefined,
            ]);
            cachedFeatureData = cached;
            if (released !== undefined) {
                if (
                    !Array.isArray(released) ||
                    released.some((entry) => typeof entry !== 'string')
                ) {
                    throw new Error('Invalid persisted assignment context releases.');
                }
                for (const assignment of released) {
                    this.releasedAssignmentContexts.add(assignment);
                }
            }
            // Older caches lack provider provenance and cannot safely defer shadowed assignments.
            if (
                this.deferredAssignmentContexts.some(
                    (entry) =>
                        !cachedFeatureData?.deferredAssignmentContexts?.some(
                            (cachedEntry) =>
                                cachedEntry.configId === entry.configId &&
                                cachedEntry.name === entry.name &&
                                Array.isArray(cachedEntry.treatmentAssignmentContexts),
                        ),
                )
            ) {
                cachedFeatureData = undefined;
            }
            // When updating from an older version of tas-client, configs may be undefined
            if (cachedFeatureData !== undefined && cachedFeatureData.configs === undefined) {
                cachedFeatureData.configs = [];
            }
        }
        if (this.features.features.length === 0) {
            this.features = cachedFeatureData || {
                features: [],
                assignmentContext: '',
                configs: [],
            };
        }
        this.cacheLoaded = true;
    }

    private get releasedAssignmentContextsStorageKey(): string {
        return `${this.storageKey}.ReleasedAssignmentContexts`;
    }

    private getDeferredAssignmentContexts(features: FeatureData): DeferredAssignmentContextData[] {
        return this.deferredAssignmentContexts.map(({ configId, name }) => {
            const cached = features.deferredAssignmentContexts?.find(
                (entry) => entry.configId === configId && entry.name === name,
            );
            if (cached) {
                return cached;
            }
            const parameters = features.configs.find((config) => config.Id === configId)
                ?.Parameters;
            const value = parameters?.[name];
            const contextId = parameters?.[`${name}.contextId`];
            const validContextId =
                typeof contextId === 'string' && contextId.length > 0 && !/[:;]/.test(contextId);
            const assignments = features.assignmentContext
                .split(';')
                .filter((assignment) => assignment.length > 0);
            const matchingAssignments = validContextId
                ? assignments.filter((assignment) => matchesAssignment(assignment, contextId))
                : [];
            const invalid =
                (value !== undefined || contextId !== undefined) &&
                matchingAssignments.length === 0;
            return {
                configId,
                name,
                assignmentContexts: invalid ? assignments : matchingAssignments,
                treatmentAssignmentContexts: value !== undefined ? matchingAssignments : [],
                contextId: validContextId ? contextId : undefined,
            };
        });
    }

    public getTreatmentVariableWithExposure<T extends boolean | number | string>(
        configId: string,
        name: string,
    ): ITreatmentWithExposure<T> {
        if (this.disposed) {
            throw new Error('Cannot read deferred treatments after disposal.');
        }
        if (!this.cacheLoaded) {
            throw new Error('Await initializePromise before reading deferred treatments.');
        }
        if (
            !this.deferredAssignmentContexts.some(
                (entry) => entry.configId === configId && entry.name === name,
            )
        ) {
            throw new Error(`Treatment '${configId}.${name}' is not deferred.`);
        }
        const value = this.getTreatmentVariable<T>(configId, name);
        if (value === undefined) {
            return { value, release: () => false };
        }
        const entry = this.getDeferredAssignmentContexts(this.features).find(
            (candidate) => candidate.configId === configId && candidate.name === name,
        )!;
        if (entry.treatmentAssignmentContexts.length === 0) {
            throw new Error(
                `Deferred treatment '${configId}.${name}' requires '${name}.contextId' to contain a variant name without an allocation ID that matches an assigned context.`,
            );
        }
        const assignments = [...entry.treatmentAssignmentContexts];
        return {
            value,
            contextId: entry.contextId,
            release: () => this.releaseAssignmentContexts(assignments),
        };
    }

    public async getTreatmentVariableWithExposureAsync<T extends boolean | number | string>(
        configId: string,
        name: string,
        checkCache?: boolean,
    ): Promise<ITreatmentWithExposure<T>> {
        await this.initializePromise;
        if (this.disposed) {
            throw new Error('Cannot read deferred treatments after disposal.');
        }
        await this.getTreatmentVariableAsync<T>(configId, name, checkCache);
        return this.getTreatmentVariableWithExposure<T>(configId, name);
    }

    private releaseAssignmentContexts(capturedAssignments: readonly string[]): boolean {
        if (this.disposed) {
            throw new Error('Cannot release assignment context after disposal.');
        }
        const currentAssignments = new Set(this.features.assignmentContext.split(';'));
        const assignments = capturedAssignments.filter((assignment) =>
            currentAssignments.has(assignment),
        );
        if (assignments.length === 0) {
            return false;
        }
        if (assignments.every((assignment) => this.releasedAssignmentContexts.has(assignment))) {
            if (!this.assignmentContextPublished) {
                this.publishAssignmentContext();
            }
            return true;
        }
        const released = new Set([...this.releasedAssignmentContexts, ...assignments]);
        this.storage!.setValue(this.releasedAssignmentContextsStorageKey, [...released]);
        for (const assignment of assignments) {
            this.releasedAssignmentContexts.add(assignment);
        }
        this.publishAssignmentContext();
        return true;
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
    public getTreatmentVariable<T extends boolean | number | string>(
        configId: string,
        name: string,
    ): T | undefined {
        this.featuresConsumed = true;
        this.PostEventToTelemetry(`${configId}.${name}`);
        const config = this.features.configs.find((c) => c.Id === configId);
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
    public async getTreatmentVariableAsync<T extends boolean | number | string>(
        configId: string,
        name: string,
        checkCache?: boolean,
    ): Promise<T | undefined> {
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

    public dispose(): void {
        this.disposed = true;
    }
}

function matchesAssignment(assignment: string, variant: string): boolean {
    const separatorIndex = assignment.lastIndexOf(':');
    return (
        assignment === variant ||
        (separatorIndex !== -1 && assignment.slice(0, separatorIndex) === variant)
    );
}
