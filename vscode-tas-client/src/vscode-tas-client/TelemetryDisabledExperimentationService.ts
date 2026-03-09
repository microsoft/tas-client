/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExperimentationService } from 'tas-client';

export default class TelemetryDisabledExperimentationService implements IExperimentationService {
    public initializePromise: Promise<void> = Promise.resolve();
    public initialFetch: Promise<void> = Promise.resolve();

    public isFlightEnabled(flight: string): boolean {
        return false;
    }

    public isCachedFlightEnabled(flight: string): Promise<boolean> {
        return Promise.resolve(false);
    }

    public isFlightEnabledAsync(flight: string): Promise<boolean> {
        return Promise.resolve(false);
    }

    public getTreatmentVariable<T extends string | number | boolean>(
        configId: string,
        name: string,
    ): T | undefined {
        return undefined;
    }

    public getTreatmentVariableAsync<T extends string | number | boolean>(
        configId: string,
        name: string,
    ): Promise<T | undefined> {
        return Promise.resolve(undefined);
    }

    public dispose(): void {
        // No-op: telemetry is disabled, nothing to clean up.
    }
}
