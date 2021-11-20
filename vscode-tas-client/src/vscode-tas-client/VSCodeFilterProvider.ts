/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExperimentationFilterProvider } from 'tas-client';
import * as vscode from 'vscode';

/**
 * Here is where we are going to define the filters we will set.
 */
export class VSCodeFilterProvider implements IExperimentationFilterProvider {
    constructor(
        private extensionName: string,
        private extensionVersion: string,
        private targetPopulation: TargetPopulation,
    ) {}

    /**
     * Returns a version string that can be parsed into a .NET Build object
     * by removing the tag suffix (for example -dev).
     *
     * @param version Version string to be trimmed.
     */
    private static trimVersionSuffix(version: string): string {
        const regex = /\-[a-zA-Z0-9]+$/;
        const result = version.split(regex);

        return result[0];
    }

    public getFilterValue(filter: string): string | null {
        switch (filter) {
            case Filters.ApplicationVersion:
                return VSCodeFilterProvider.trimVersionSuffix(vscode.version);
            case Filters.Build:
                return vscode.env.appName;
            case Filters.ClientId:
                return vscode.env.machineId;
            case Filters.ExtensionName:
                return this.extensionName;
            case Filters.ExtensionVersion:
                return VSCodeFilterProvider.trimVersionSuffix(this.extensionVersion);
            case Filters.Language:
                return vscode.env.language;
            case Filters.TargetPopulation:
                return this.targetPopulation;
            default:
                return '';
        }
    }

    public getFilters(): Map<string, any> {
        let filters: Map<string, any> = new Map<string, any>();
        let filterValues = Object.values(Filters);
        for (let value of filterValues) {
            filters.set(value, this.getFilterValue(value));
        }

        return filters;
    }
}

/*
Based upon the official VSCode currently existing filters in the
ExP backend for the VSCode cluster. 
https://experimentation.visualstudio.com/Analysis%20and%20Experimentation/_git/AnE.ExP.TAS.TachyonHost.Configuration?path=%2FConfigurations%2Fvscode%2Fvscode.json&version=GBmaster
"X-MSEdge-Market": "detection.market",
"X-FD-Corpnet": "detection.corpnet",
"X-VSCode–AppVersion": "appversion",
"X-VSCode-Build": "build",
"X-MSEdge-ClientId": "clientid",
"X-VSCode-ExtensionName": "extensionname",
"X-VSCode-ExtensionVersion": "extensionversion",
"X-VSCode-TargetPopulation": "targetpopulation",
"X-VSCode-Language": "language"
*/

/**
 * All available filters, can be updated.
 */
export enum Filters {
    /**
     * The market in which the extension is distributed.
     */
    Market = 'X-MSEdge-Market',

    /**
     * The corporation network.
     */
    CorpNet = 'X-FD-Corpnet',

    /**
     * Version of the application which uses experimentation service.
     */
    ApplicationVersion = 'X-VSCode-AppVersion',

    /**
     * Insiders vs Stable.
     */
    Build = 'X-VSCode-Build',

    /**
     * Client Id which is used as primary unit for the experimentation.
     */
    ClientId = 'X-MSEdge-ClientId',

    /**
     * Extension header.
     */
    ExtensionName = 'X-VSCode-ExtensionName',

    /**
     * The version of the extension.
     */
    ExtensionVersion = 'X-VSCode-ExtensionVersion',

    /**
     * The language in use by VS Code
     */
    Language = 'X-VSCode-Language',

    /**
     * The target population.
     * This is used to separate internal, early preview, GA, etc.
     */
    TargetPopulation = 'X-VSCode-TargetPopulation',
}

/**
 * Specifies the target population for the experimentation filter.
 */
export enum TargetPopulation {
    Team = 'team',
    Internal = 'internal',
    Insiders = 'insider',
    Public = 'public',
}
