/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export {
    IKeyValueStorage,
    IExperimentationService,
    IExperimentationTelemetry,
    IExperimentationFilterProvider,
} from 'tas-client';
export { getExperimentationService, getExperimentationServiceAsync } from './vscode-tas-client/VSCodeTasClient';
export { TargetPopulation } from './vscode-tas-client/VSCodeFilterProvider';
