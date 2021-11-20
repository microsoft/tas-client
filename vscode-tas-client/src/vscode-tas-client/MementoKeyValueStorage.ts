/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IKeyValueStorage } from 'tas-client';
import * as vscode from 'vscode';

export class MementoKeyValueStorage implements IKeyValueStorage {
    constructor(private mementoGlobalStorage: vscode.Memento) {}

    public async getValue<T>(key: string, defaultValue?: T | undefined): Promise<T | undefined> {
        const value = await this.mementoGlobalStorage.get<T>(key);
        return value || defaultValue;
    }

    public setValue<T>(key: string, value: T): void {
        this.mementoGlobalStorage.update(key, value);
    }
}
