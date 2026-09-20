/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryKeyValueStorage } from '../src/tas-client/Util/MemoryKeyValueStorage.js';

describe('MemoryKeyValueStorage', () => {
    let storage: MemoryKeyValueStorage;

    beforeEach(() => {
        storage = new MemoryKeyValueStorage();
    });

    it('returns undefined for missing keys without persisting a default', async () => {
        expect(await storage.getValue('missing')).toBeUndefined();
        expect(await storage.getValue('missing', 'fallback')).toBe('fallback');
        expect(await storage.getValue('missing')).toBeUndefined();
    });

    it.each([false, 0, '', null])('preserves the falsy default %j', async (value) => {
        expect(await storage.getValue('missing', value)).toBe(value);
    });

    it.each([false, 0, '', null, undefined])(
        'returns a stored %j rather than the fallback',
        async (value) => {
            storage.setValue('setting', value);
            expect(await storage.getValue('setting', 'fallback')).toBe(value);
        },
    );

    it('overwrites individual keys and keeps instances isolated', async () => {
        const features = { features: ['editor.preview'] };
        storage.setValue('features', features);
        storage.setValue('version', 1);
        storage.setValue('version', 2);

        expect(await storage.getValue('features')).toEqual(features);
        expect(await storage.getValue('version')).toBe(2);
        expect(await new MemoryKeyValueStorage().getValue('features')).toBeUndefined();
    });
});
