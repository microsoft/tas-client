/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IKeyValueStorage } from '../../src/contracts/IKeyValueStorage.js';

export class KeyValueStorageMock implements IKeyValueStorage {
    private readonly values = new Map<string, unknown>();
    public readonly reads: string[] = [];
    public readonly writes: { key: string; value: unknown }[] = [];
    public readBarrier?: Promise<void>;

    public async getValue<T>(key: string, defaultValue?: T): Promise<T | undefined> {
        this.reads.push(key);
        const value = this.values.has(key) ? this.values.get(key) : defaultValue;
        if (this.readBarrier) {
            await this.readBarrier;
        }
        return value as T | undefined;
    }

    public setValue<T>(key: string, value: T): void {
        this.values.set(key, value);
        this.writes.push({ key, value });
    }
}
