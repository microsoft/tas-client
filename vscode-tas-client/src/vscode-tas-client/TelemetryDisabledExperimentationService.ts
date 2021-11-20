/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExperimentationService } from 'tas-client';

export default class TelemetryDisabledExperimentationService implements IExperimentationService {
    initializePromise: Promise<void> = Promise.resolve();
    initialFetch: Promise<void> = Promise.resolve();

    isFlightEnabled(flight: string): boolean {
        return false;
    }

    isCachedFlightEnabled(flight: string): Promise<boolean> {
        return Promise.resolve(false);
    }

    isFlightEnabledAsync(flight: string): Promise<boolean> {
        return Promise.resolve(false);
    }

    getTreatmentVariable<T extends string | number | boolean>(configId: string, name: string): T | undefined {
        return undefined;
    }

    getTreatmentVariableAsync<T extends string | number | boolean>(configId: string, name: string): Promise<T | undefined> {
        return Promise.resolve(undefined);
    }

}
