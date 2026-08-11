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
    AssignmentsFetchFn,
    FetchFn,
} from 'tas-client';
import * as vscode from 'vscode';
import { MementoKeyValueStorage } from './MementoKeyValueStorage';
import { TargetPopulation } from './VSCodeFilterProvider';
import { VSCodeAssignmentsFilterProvider } from './VSCodeAssignmentsFilterProvider';
import TelemetryDisabledExperimentationService from './TelemetryDisabledExperimentationService';

const endpoint: string = 'https://default.exp-tas.com/vscode/ab';
const telemetryEventName = 'query-expfeature';
const assignmentContextTelemetryPropertyName = 'abexp.assignmentcontext';
const storageKey = 'VSCode.ABExp.FeatureData';
const refetchInterval = 1000 * 60 * 30; // By default it's set up to 30 minutes.

/**
 * Options for {@link getExperimentationServiceFromConfig}.
 */
export interface ExperimentationConfig {
    extensionName: string;
    extensionVersion: string;
    targetPopulation: TargetPopulation;
    telemetry: IExperimentationTelemetry;
    memento: vscode.Memento;
    /** Filter providers for the legacy TAS endpoint. */
    filterProviders?: IExperimentationFilterProvider[];
    /**
     * Full URL of the new TAS assignments API (POST /api/v1/assignments). When set, a
     * request is sent there in parallel with the legacy endpoint and its assignments are
     * merged into the active feature set (new values take precedence for overlapping
     * variables).
     */
    assignmentsEndpoint?: string;
    /**
     * Additional filter providers for the new assignments endpoint. These must emit the
     * new assignments-API parameter names. The generic VS Code filters are added
     * automatically, so callers only pass their domain-specific providers.
     */
    assignmentsFilterProviders?: IExperimentationFilterProvider[];
    /**
     * Optional custom transport for the assignments endpoint (e.g. the VS Code fetcher
     * service), used instead of the built-in HTTP client for that request.
     */
    assignmentsFetch?: AssignmentsFetchFn;
    /**
     * Optional custom transport used for both the legacy endpoint (GET) and the assignments
     * endpoint (POST) (e.g. the VS Code fetcher service), so both requests get proxy handling.
     * A per-endpoint {@link assignmentsFetch}, if set, takes precedence for assignments.
     */
    fetch?: FetchFn;
}

/**
 * Creates an experimentation service from a config object. Supports the new TAS
 * assignments endpoint via {@link ExperimentationConfig.assignmentsEndpoint}.
 */
export function getExperimentationServiceFromConfig(
    config: ExperimentationConfig,
): IExperimentationService {
    if (!config.memento) {
        throw new Error('Memento storage was not provided.');
    }

    const telemetryConfig = vscode.workspace.getConfiguration('telemetry');
    const telemetryEnabled =
        vscode.env.isTelemetryEnabled === undefined
            ? telemetryConfig.get<boolean>('enableTelemetry', true)
            : vscode.env.isTelemetryEnabled;
    if (!telemetryEnabled) {
        return new TelemetryDisabledExperimentationService();
    }

    const extensionFilterProvider: IExperimentationFilterProvider = new VSCodeFilterProvider(
        config.extensionName,
        config.extensionVersion,
        config.targetPopulation,
    );
    const providerList = [extensionFilterProvider, ...(config.filterProviders ?? [])];
    const keyValueStorage = new MementoKeyValueStorage(config.memento);

    const assignmentsFilterProviders = config.assignmentsEndpoint
        ? [
              new VSCodeAssignmentsFilterProvider(config.extensionName, config.targetPopulation),
              ...(config.assignmentsFilterProviders ?? []),
          ]
        : undefined;

    return new ExperimentationService({
        filterProviders: providerList,
        telemetry: config.telemetry,
        storageKey: storageKey,
        keyValueStorage: keyValueStorage,
        featuresTelemetryPropertyName: '',
        assignmentContextTelemetryPropertyName: assignmentContextTelemetryPropertyName,
        telemetryEventName: telemetryEventName,
        endpoint: endpoint,
        extensionName: config.extensionName,
        fetch: config.fetch,
        assignmentsEndpoint: config.assignmentsEndpoint,
        assignmentsFilterProviders: assignmentsFilterProviders,
        assignmentsFetch: config.assignmentsFetch,
        refetchInterval: refetchInterval,
    });
}

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
    return getExperimentationServiceFromConfig({
        extensionName,
        extensionVersion,
        targetPopulation,
        telemetry,
        memento,
        filterProviders,
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
    const experimentationService = getExperimentationService(
        extensionName,
        extensionVersion,
        targetPopulation,
        telemetry,
        memento,
        ...filterProviders,
    );
    await experimentationService.initializePromise;
    return experimentationService;
}
