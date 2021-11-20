/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import axios, { AxiosRequestConfig, AxiosPromise } from 'axios';

export class AxiosHttpClient {
    constructor(private endpoint: string) {}

    public get(config?: AxiosRequestConfig | undefined): AxiosPromise<any> {
        return axios.get(
            this.endpoint,
            {
                ...config,
                proxy: false, // Disabling axios proxy support allows VS Code proxy settings to take effect.
            });
    }
}
