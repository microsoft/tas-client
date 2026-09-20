/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { WorkspaceConfiguration } from 'vscode';

class FakeTelemetryConfiguration implements Pick<WorkspaceConfiguration, 'get'> {
    public enabled: boolean | undefined;
    public readonly reads: { key: string; defaultValue: unknown }[] = [];

    public get<T>(key: string): T | undefined;
    public get<T>(key: string, defaultValue: T): T;
    public get<T>(key: string, defaultValue?: T): T | undefined {
        this.reads.push({ key, defaultValue });
        return key === 'enableTelemetry' && this.enabled !== undefined
            ? (this.enabled as T)
            : defaultValue;
    }

    public reset(): void {
        this.enabled = undefined;
        this.reads.length = 0;
    }
}

export class FakeVSCode {
    public version = '1.85.0';
    public readonly env = {
        appName: 'Visual Studio Code',
        machineId: 'test-machine-id',
        language: 'en',
        isTelemetryEnabled: true as boolean | undefined,
    };
    public readonly telemetryConfiguration = new FakeTelemetryConfiguration();
    public readonly configurationRequests: (string | undefined)[] = [];
    public readonly workspace = {
        getConfiguration: (section?: string): Pick<WorkspaceConfiguration, 'get'> => {
            this.configurationRequests.push(section);
            return this.telemetryConfiguration;
        },
    };

    public reset(): void {
        this.version = '1.85.0';
        this.env.appName = 'Visual Studio Code';
        this.env.machineId = 'test-machine-id';
        this.env.language = 'en';
        this.env.isTelemetryEnabled = true;
        this.telemetryConfiguration.reset();
        this.configurationRequests.length = 0;
    }
}

export const fakeVSCode = new FakeVSCode();
