/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** A treatment snapshot whose assignment is not published until explicitly released. */
export interface ITreatmentWithExposure<T extends boolean | number | string> {
    readonly value: T | undefined;
    /** The variant name, without its allocation ID, for diagnostics and legacy exposure migration. */
    readonly contextId?: string;
    /** Publishes only this snapshot's assignment; returns false if unassigned or no longer current. */
    release(): boolean;
}

/**
 * Experimentation service provides A/B experimentation functionality.
 * Currently it's per design to be able to only allow querying one flight at the time.
 * This is in order for us to control events and telemetry whenever these methods are called.
 */
export interface IExperimentationService {
    /**
     * Promise indicating that the experimentation service has been
     * initialized, so it's safe to make a call to isFlightEnabled.
     */
    readonly initializePromise: Promise<void>;

    /**
     * Promise that resolves when the experimentation service has completed
     * its first request to the Treatment Assignment Service. If this request
     * is successful, flights are up-to-date.
     */
    readonly initialFetch: Promise<void>;

    /**
     * @deprecated Use `getTreatmentVariable` instead.
     *
     * Returns a value indicating whether the given flight is enabled.
     * It uses the values currently in memory, so the experimentation service
     * must be initialized before calling.
     * @param flight The flight to check.
     */
    isFlightEnabled(flight: string): boolean;

    /**
     * @deprecated Use `getTreatmentVariable` instead.
     *
     * Returns a value indicating whether the given flight is enabled.
     * It uses the values currently on cache.
     * @param flight The flight to check.
     */
    isCachedFlightEnabled(flight: string): Promise<boolean>;

    /**
     * @deprecated Use `getTreatmentVariableAsync` instead.
     *
     * Returns a value indicating whether the given flight is enabled.
     * It re-fetches values from the server.
     * @param flight the flight to check.
     */
    isFlightEnabledAsync(flight: string): Promise<boolean>;

    /**
     * Returns the value of the treatment variable, or undefined if not found.
     * It uses the values currently in memory, so the experimentation service
     * must be initialized before calling.
     * @param config name of the config to check.
     * @param name name of the treatment variable.
     */
    getTreatmentVariable<T extends boolean | number | string>(
        configId: string,
        name: string,
    ): T | undefined;

    /**
     * Returns the value of the treatment variable, or undefined if not found.
     * It re-fetches values from the server. If checkCache is true and the value exists
     * in the cache, the Treatment Assignment Service is not called.
     * @param config name of the config to check.
     * @param name name of the treatment variable.
     * @param checkCache check the cache for the variable before calling the TAS.
     */
    getTreatmentVariableAsync<T extends boolean | number | string>(
        configId: string,
        name: string,
        checkCache?: boolean,
    ): Promise<T | undefined>;

    /**
     * Reads a statically deferred treatment and binds release to its current assignment.
     * Await `initializePromise` first; `<name>.contextId` must contain the arm's variant name.
     */
    getTreatmentVariableWithExposure<T extends boolean | number | string>(
        configId: string,
        name: string,
    ): ITreatmentWithExposure<T>;

    /** Reads a deferred treatment after initialization, fetching unless a cached value is usable. */
    getTreatmentVariableWithExposureAsync<T extends boolean | number | string>(
        configId: string,
        name: string,
        checkCache?: boolean,
    ): Promise<ITreatmentWithExposure<T>>;

    /**
     * Disposes the experimentation service and stops any ongoing polling.
     */
    dispose(): void;
}
