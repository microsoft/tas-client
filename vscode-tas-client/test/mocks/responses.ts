/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type TreatmentValue = string | number | boolean;

export interface CachedFeatureData {
    features: string[];
    assignmentContext: string;
    configs: { Id: string; Parameters: Record<string, TreatmentValue> }[];
}

export function cachedFeatures(
    parameters: Record<string, TreatmentValue>,
    assignmentContext = 'cached:control;',
): CachedFeatureData {
    return {
        features: Object.keys(parameters).map((key) => key + (parameters[key] ? '' : 'cf')),
        assignmentContext,
        configs: [{ Id: 'vscode', Parameters: parameters }],
    };
}

export function legacyResponse(
    parameters: Record<string, TreatmentValue>,
    assignmentContext = 'legacy:control;',
) {
    return {
        Features: [],
        Flights: [],
        Configs: [{ Id: 'vscode', Parameters: parameters }],
        ParameterGroups: [],
        FlightingVersion: 1,
        ImpressionId: 'deterministic-impression',
        FlightingEnrichments: {},
        AssignmentContext: assignmentContext,
    };
}

export function assignmentsResponse(
    featureVariables: Record<string, string>,
    assignmentContext = 'assignments:treatment;',
) {
    return {
        featureVariables,
        assignedVariants: [
            {
                name: 'treatment',
                numberline: 'experiment',
                isForced: false,
                variantAllocationId: 1,
            },
        ],
        dataVersion: 1,
        assignmentContext,
    };
}
