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
}

export interface IFeatureProvider {
    /**
     * Features property. Usually contains the cached features, but if called before having cache it will fetch from the server.
     */
    getFeatures(): Promise<FeatureData>;
}
