/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSCodeFilterProvider } from './VSCodeFilterProvider';
import {
    IExperimentationService,
    ExperimentationService,
    IExperimentationTelemetry,
    IExperimentationFilterProvider,
} from 'tas-client';
import * as vscode from 'vscode';
import { MementoKeyValueStorage } from './MementoKeyValueStorage';
import { TargetPopulation } from './VSCodeFilterProvider';
import TelemetryDisabledExperimentationService from './TelemetryDisabledExperimentationService';

const endpoint: string = 'https://default.exp-tas.com/vscode/ab';
const telemetryEventName = 'query-expfeature';
const assignmentContextTelemetryPropertyName = 'abexp.assignmentcontext';
const storageKey = 'VSCode.ABExp.FeatureData';
const refetchInterval = 1000 * 60 * 30; // By default it's set up to 30 minutes.

/**
 *
 * @param extensionName The name of the extension.
 * @param extensionVersion The version of the extension.
 * @param telemetry Telemetry implementation.
 * @param targetPopulation An enum containing the target population ('team', 'internal', 'insiders', 'public').
 * @param memento The memento state to be used for cache.
 * @param filterProviders The filter providers.
 */
export function getExperimentationService(
    extensionName: string,
    extensionVersion: string,
    targetPopulation: TargetPopulation,
    telemetry: IExperimentationTelemetry,
    memento: vscode.Memento,
    ...filterProviders: IExperimentationFilterProvider[]
): IExperimentationService {
    if (!memento) {
        throw new Error('Memento storage was not provided.');
    }

    const config = vscode.workspace.getConfiguration('telemetry');
    const telemetryEnabled = vscode.env.isTelemetryEnabled === undefined
                                ? config.get<boolean>('enableTelemetry', true)
                                : vscode.env.isTelemetryEnabled;
    if (!telemetryEnabled) {
        return new TelemetryDisabledExperimentationService();
    }

    const extensionFilterProvider: IExperimentationFilterProvider = new VSCodeFilterProvider(
        extensionName,
        extensionVersion,
        targetPopulation,
    );
    const providerList = [extensionFilterProvider, ...filterProviders];
    const keyValueStorage = new MementoKeyValueStorage(memento);

    return new ExperimentationService({
        filterProviders: providerList,
        telemetry: telemetry,
        storageKey: storageKey,
        keyValueStorage: keyValueStorage,
        featuresTelemetryPropertyName: '',
        assignmentContextTelemetryPropertyName: assignmentContextTelemetryPropertyName,
        telemetryEventName: telemetryEventName,
        endpoint: endpoint,
        refetchInterval: refetchInterval,
    });
}

/**
 * Returns the experimentation service after waiting on initialize.
 * 
 * @param extensionName The name of the extension.
 * @param extensionVersion The version of the extension.
 * @param telemetry Telemetry implementation.
 * @param targetPopulation An enum containing the target population ('team', 'internal', 'insiders', 'public').
 * @param memento The memento state to be used for cache.
 * @param filterProviders The filter providers.
 */
export async function getExperimentationServiceAsync(
    extensionName: string,
    extensionVersion: string,
    targetPopulation: TargetPopulation,
    telemetry: IExperimentationTelemetry,
    memento: vscode.Memento,
    ...filterProviders: IExperimentationFilterProvider[]
): Promise<IExperimentationService> {
    const experimentationService = getExperimentationService(extensionName, extensionVersion, targetPopulation, telemetry, memento, ...filterProviders);
    await experimentationService.initializePromise;
    return experimentationService;
}
