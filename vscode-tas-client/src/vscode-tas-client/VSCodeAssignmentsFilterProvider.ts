/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExperimentationFilterProvider } from 'tas-client';
import * as vscode from 'vscode';
import { TargetPopulation } from './VSCodeFilterProvider';

/**
 * userParam names for the new TAS assignments API (POST /api/v1/assignments) that mirror
 * the generic VS Code filters emitted by {@link VSCodeFilterProvider}.
 */
export enum AssignmentsFilters {
    ApplicationVersion = 'vscode_core_appversion',
    Build = 'vscode_core_build',
    ExtensionName = 'vscode_core_extensionname',
    ExtensionNameShort = 'extensionname',
    TargetPopulation = 'vscode_core_targetpopulation',
}

/**
 * Emits the generic VS Code filters for the new TAS assignments API using the new
 * userParam key names, so the assignments endpoint never receives the legacy header keys.
 */
export class VSCodeAssignmentsFilterProvider implements IExperimentationFilterProvider {
    constructor(
        private extensionName: string,
        private targetPopulation: TargetPopulation,
    ) {}

    private static trimVersionSuffix(version: string): string {
        const result = version.split(/\-[a-zA-Z0-9]+$/);
        return result[0];
    }

    public getFilters(): Map<string, string> {
        const filters = new Map<string, string>();
        filters.set(
            AssignmentsFilters.ApplicationVersion,
            VSCodeAssignmentsFilterProvider.trimVersionSuffix(vscode.version),
        );
        filters.set(AssignmentsFilters.Build, vscode.env.appName);
        filters.set(AssignmentsFilters.ExtensionName, this.extensionName);
        filters.set(AssignmentsFilters.ExtensionNameShort, this.extensionName);
        filters.set(AssignmentsFilters.TargetPopulation, this.targetPopulation);
        return filters;
    }
}
