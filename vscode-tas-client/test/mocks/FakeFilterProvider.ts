/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IExperimentationFilterProvider } from 'tas-client';

export class FakeFilterProvider implements IExperimentationFilterProvider {
    public callCount = 0;

    constructor(public readonly values: Record<string, string>) {}

    public getFilters(): Map<string, string> {
        this.callCount += 1;
        return new Map(Object.entries(this.values));
    }
}
