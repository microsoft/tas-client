/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Memento } from 'vscode';

export class FakeMemento implements Memento {
    private readonly values: Map<string, unknown>;
    public readonly reads: string[] = [];
    public readonly writes: { key: string; value: unknown }[] = [];

    constructor(initialValues: Record<string, unknown> = {}) {
        this.values = new Map(Object.entries(initialValues));
    }

    public get<T>(key: string): T | undefined;
    public get<T>(key: string, defaultValue: T): T;
    public get<T>(key: string, defaultValue?: T): T | undefined {
        this.reads.push(key);
        return this.values.has(key) ? (this.values.get(key) as T) : defaultValue;
    }

    public update(key: string, value: unknown): Promise<void> {
        this.writes.push({ key, value });
        if (value === undefined) {
            this.values.delete(key);
        } else {
            this.values.set(key, value);
        }
        return Promise.resolve();
    }

    public keys(): readonly string[] {
        return [...this.values.keys()];
    }
}
