/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Provides a value for the given filter.
 * This filters are used in within the Feature providers.
 */
export interface IExperimentationFilterProvider {
    /**
     * Get filter value by enum
     * @param filter The filter type.
     */
    getFilters(): Map<string, any>;
}
