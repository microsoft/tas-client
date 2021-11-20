/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IKeyValueStorage } from '../../src/contracts/IKeyValueStorage';
export class KeyValueStorageMock implements IKeyValueStorage {
    private storage: Map<string, any> = new Map<string, any>();

    public async getValue<T>(key: string, defaultValue?: T): Promise<T | undefined> {
        if (this.storage.has(key)) {
            return await Promise.resolve(this.storage.get(key));
        }

        return await Promise.resolve(defaultValue || undefined);
    }

    public setValue<T>(key: string, value: T): void {
        this.storage.set(key, value);
    }
}
