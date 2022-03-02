/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FeatureData } from "../../src/tas-client/FeatureProvider/IFeatureProvider";

export class FetchResolver {
    private availableResults: FeatureData[] = [];
    private lastServed: number = 0;
    constructor(...result: FeatureData[]) {
        this.availableResults = result;
    }

    public nextResult(): FeatureData {
        if (this.lastServed >= this.availableResults.length) {
            // Always keep serving the last result.
            this.lastServed = this.availableResults.length - 1;
        }

        let nextResult = this.availableResults[this.lastServed];
        this.lastServed++;
        return nextResult;
    }
}
