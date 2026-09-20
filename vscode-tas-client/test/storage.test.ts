/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import { MementoKeyValueStorage } from '../src/vscode-tas-client/MementoKeyValueStorage';
import { FakeMemento } from './mocks/FakeMemento';

describe('MementoKeyValueStorage', () => {
    it('uses the supplied fallback only for a missing value', async () => {
        const memento = new FakeMemento();
        const storage = new MementoKeyValueStorage(memento);
        const fallback = { features: [] };

        await expect(storage.getValue('missing')).resolves.toBeUndefined();
        await expect(storage.getValue('missing', fallback)).resolves.toBe(fallback);
        expect(memento.reads).toEqual(['missing', 'missing']);
        expect(memento.writes).toEqual([]);
    });

    it.each([
        { value: false, fallback: true },
        { value: 0, fallback: 42 },
        { value: '', fallback: 'default' },
        { value: null, fallback: 'default' },
        { value: true, fallback: false },
        { value: 7, fallback: 42 },
        { value: 'cached', fallback: 'default' },
    ])('preserves cached $value instead of the fallback', async ({ value, fallback }) => {
        const storage = new MementoKeyValueStorage(new FakeMemento({ treatment: value }));

        await expect(storage.getValue<unknown>('treatment', fallback)).resolves.toBe(value);
        await expect(storage.getValue<unknown>('treatment')).resolves.toBe(value);
    });

    it('round-trips structured feature data through the given memento and key', async () => {
        const memento = new FakeMemento();
        const storage = new MementoKeyValueStorage(memento);
        const cached = {
            features: ['enabled'],
            assignmentContext: 'experiment:control;',
            configs: [{ Id: 'vscode', Parameters: { enabled: true, count: 0, label: '' } }],
        };

        expect(storage.setValue('VSCode.ABExp.FeatureData', cached)).toBeUndefined();

        expect(memento.writes).toEqual([{ key: 'VSCode.ABExp.FeatureData', value: cached }]);
        await expect(storage.getValue('VSCode.ABExp.FeatureData')).resolves.toEqual(cached);
        expect(memento.keys()).toEqual(['VSCode.ABExp.FeatureData']);
    });

    it('overwrites and deletes values without changing unrelated keys', async () => {
        const memento = new FakeMemento({ treatment: 'old', unrelated: 'keep' });
        const storage = new MementoKeyValueStorage(memento);

        storage.setValue('treatment', 'new');
        await expect(storage.getValue('treatment')).resolves.toBe('new');
        storage.setValue('treatment', undefined);

        await expect(storage.getValue('treatment', 'fallback')).resolves.toBe('fallback');
        await expect(storage.getValue('unrelated')).resolves.toBe('keep');
        expect(memento.keys()).toEqual(['unrelated']);
        expect(memento.writes).toEqual([
            { key: 'treatment', value: 'new' },
            { key: 'treatment', value: undefined },
        ]);
    });

    it('isolates storage belonging to different extension contexts', async () => {
        const first = new MementoKeyValueStorage(new FakeMemento());
        const second = new MementoKeyValueStorage(new FakeMemento());

        first.setValue('treatment', 'first-extension');
        second.setValue('treatment', 'second-extension');

        await expect(first.getValue('treatment')).resolves.toBe('first-extension');
        await expect(second.getValue('treatment')).resolves.toBe('second-extension');
    });

    it('propagates a host storage read error to its caller', async () => {
        const memento = new FakeMemento();
        const error = new Error('Memento could not be read');
        vi.spyOn(memento, 'get').mockImplementation(() => {
            throw error;
        });

        await expect(new MementoKeyValueStorage(memento).getValue('treatment')).rejects.toBe(error);
    });
});
