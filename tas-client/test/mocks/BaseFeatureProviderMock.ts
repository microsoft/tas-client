/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vi } from 'vitest';
import { BaseFeatureProvider } from '../../src/tas-client/FeatureProvider/BaseFeatureProvider.js';
import { FeatureData } from '../../src/tas-client/FeatureProvider/IFeatureProvider.js';
import { ExperimentationTelemetryMock } from './ExperimentationTelemetryMock.js';

export function createFeatureData(overrides: Partial<FeatureData> = {}): FeatureData {
    return { features: [], assignmentContext: '', configs: [], ...overrides };
}

export class BaseFeatureProviderMock extends BaseFeatureProvider {
    public readonly fetch = vi
        .fn<() => Promise<FeatureData>>()
        .mockRejectedValue(new Error('No feature provider response configured'));

    constructor(data?: FeatureData) {
        super(new ExperimentationTelemetryMock());
        if (data !== undefined) {
            this.fetch.mockResolvedValue(data);
        }
    }
}
