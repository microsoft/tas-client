/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ConfigData {
    Id: string;
    Parameters: Parameters;
}

export interface Parameters {
    [key: string]: boolean | number | string;
}

export interface FeatureData {
    features: string[];
    assignmentContext: string;
    configs: ConfigData[];
    /** Per-variable provenance retained across provider merges and cache reloads. */
    deferredAssignmentContexts?: DeferredAssignmentContextData[];
}

export interface DeferredAssignmentContextData {
    configId: string;
    name: string;
    /** All withheld entries, including assignments shadowed by another provider. */
    assignmentContexts: string[];
    /** Entries belonging to the provider of the effective treatment value. */
    treatmentAssignmentContexts: string[];
    contextId?: string;
}

export interface IFeatureProvider {
    /**
     * Features property. Usually contains the cached features, but if called before having cache it will fetch from the server.
     */
    getFeatures(): Promise<FeatureData>;
}
