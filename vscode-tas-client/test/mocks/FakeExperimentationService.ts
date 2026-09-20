/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ExperimentationServiceConfig, IExperimentationService } from 'tas-client';

export class FakeExperimentationService implements IExperimentationService {
    public static readonly instances: FakeExperimentationService[] = [];
    public static nextInitialization: Promise<void> | undefined;
    public static nextInitialFetch: Promise<void> | undefined;
    public readonly initializePromise: Promise<void>;
    public readonly initialFetch: Promise<void>;
    public disposed = false;

    constructor(public readonly options: ExperimentationServiceConfig) {
        this.initializePromise = FakeExperimentationService.nextInitialization ?? Promise.resolve();
        this.initialFetch = FakeExperimentationService.nextInitialFetch ?? Promise.resolve();
        FakeExperimentationService.nextInitialization = undefined;
        FakeExperimentationService.nextInitialFetch = undefined;
        FakeExperimentationService.instances.push(this);
    }

    public static reset(): void {
        this.instances.length = 0;
        this.nextInitialization = undefined;
        this.nextInitialFetch = undefined;
    }

    public isFlightEnabled(_flight: string): boolean {
        return false;
    }

    public async isCachedFlightEnabled(_flight: string): Promise<boolean> {
        return false;
    }

    public async isFlightEnabledAsync(_flight: string): Promise<boolean> {
        return false;
    }

    public getTreatmentVariable<T extends string | number | boolean>(
        _configId: string,
        _name: string,
    ): T | undefined {
        return undefined;
    }

    public async getTreatmentVariableAsync<T extends string | number | boolean>(
        _configId: string,
        _name: string,
        _checkCache?: boolean,
    ): Promise<T | undefined> {
        return undefined;
    }

    public dispose(): void {
        this.disposed = true;
    }
}
