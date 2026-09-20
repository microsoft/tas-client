/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Memento } from 'vscode';
import type { IExperimentationService, ITreatmentWithExposure } from '../src/index';

const telemetryState = vi.hoisted(() => ({ enabled: true }));
vi.mock('vscode', () => ({
    version: '1.85.0',
    env: {
        appName: 'Visual Studio Code',
        machineId: 'test-machine',
        language: 'en',
        get isTelemetryEnabled() {
            return telemetryState.enabled;
        },
    },
    workspace: { getConfiguration: () => ({ get: () => true }) },
}));

import { getExperimentationServiceFromConfig } from '../src/vscode-tas-client/VSCodeTasClient';
import { TargetPopulation } from '../src/vscode-tas-client/VSCodeFilterProvider';

class TestMemento implements Memento {
    private readonly values = new Map<string, unknown>();
    keys(): readonly string[] {
        return [...this.values.keys()];
    }
    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    get<T>(key: string, defaultValue?: T): T | undefined {
        return this.values.has(key) ? (this.values.get(key) as T) : defaultValue;
    }
    async update(key: string, value: unknown): Promise<void> {
        this.values.set(key, value);
    }
}

describe('Deferred assignment context configuration', () => {
    let client: IExperimentationService | undefined;
    afterEach(() => {
        client?.dispose();
        client = undefined;
        telemetryState.enabled = true;
    });

    function createClient() {
        const properties = new Map<string, string>();
        const fetch = vi.fn(async () => ({
            status: 200,
            json: async () => ({
                Configs: [
                    {
                        Id: 'vscode',
                        Parameters: { 'tour.show': true, 'tour.show.contextId': 'arm' },
                    },
                ],
                AssignmentContext: 'eager:1;arm:2',
            }),
        }));
        client = getExperimentationServiceFromConfig({
            extensionName: 'test',
            extensionVersion: '1.0.0',
            targetPopulation: TargetPopulation.Public,
            telemetry: {
                setSharedProperty: (name, value) => {
                    properties.set(name, value);
                },
                postEvent: () => {},
            },
            memento: new TestMemento(),
            deferredAssignmentContexts: [{ configId: 'vscode', name: 'tour.show' }],
            fetch,
        });
        return { service: client, properties, fetch };
    }

    it('forwards startup configuration and the release API', async () => {
        const { service, properties } = createClient();
        await service.initialFetch;
        const before = properties.get('abexp.assignmentcontext');
        const treatment: ITreatmentWithExposure<boolean> =
            service.getTreatmentVariableWithExposure<boolean>('vscode', 'tour.show');
        const released = treatment.release();
        expect({
            before,
            value: treatment.value,
            released,
            after: properties.get('abexp.assignmentcontext'),
        }).toEqual({
            before: 'eager:1',
            value: true,
            released: true,
            after: 'eager:1;arm:2',
        });
    });

    it('does not fetch or release when telemetry is disabled', async () => {
        telemetryState.enabled = false;
        const { service, properties, fetch } = createClient();
        const treatment = await service.getTreatmentVariableWithExposureAsync(
            'vscode',
            'tour.show',
            true,
        );
        expect({
            value: treatment.value,
            released: treatment.release(),
            properties: [...properties],
            calls: fetch.mock.calls,
        }).toEqual({ value: undefined, released: false, properties: [], calls: [] });
    });
});
