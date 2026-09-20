/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { FeatureData } from '../src/tas-client/FeatureProvider/IFeatureProvider.js';
import { BaseFeatureProviderMock, createFeatureData } from './mocks/BaseFeatureProviderMock.js';
import { Deferred } from './mocks/Deferred.js';

describe('BaseFeatureProvider', () => {
    it('shares an in-flight request but fetches again after it completes', async () => {
        const pending = new Deferred<FeatureData>();
        const initial = createFeatureData({ features: ['editor.preview'] });
        const updated = createFeatureData({ features: ['editor.stable'] });
        const provider = new BaseFeatureProviderMock();
        provider.fetch.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(updated);

        const requests = [provider.getFeatures(), provider.getFeatures(), provider.getFeatures()];
        expect(provider.fetch).toHaveBeenCalledTimes(1);

        pending.resolve(initial);
        expect(await Promise.all(requests)).toEqual([initial, initial, initial]);
        expect(await provider.getFeatures()).toEqual(updated);
        expect(provider.fetch).toHaveBeenCalledTimes(2);
    });

    it('rejects all waiting callers and allows a fresh request after a failure', async () => {
        const pending = new Deferred<FeatureData>();
        const error = new Error('Connection reset');
        const recovered = createFeatureData({ features: ['editor.preview'] });
        const provider = new BaseFeatureProviderMock();
        provider.fetch.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(recovered);

        const first = expect(provider.getFeatures()).rejects.toBe(error);
        const second = expect(provider.getFeatures()).rejects.toBe(error);
        pending.reject(error);
        await Promise.all([first, second]);

        expect(await provider.getFeatures()).toEqual(recovered);
        expect(provider.fetch).toHaveBeenCalledTimes(2);
    });

    it('can retry after a fetch implementation throws synchronously', async () => {
        const provider = new BaseFeatureProviderMock();
        const error = new Error('Transport setup failed');
        const data = createFeatureData();
        provider.fetch
            .mockImplementationOnce(() => {
                throw error;
            })
            .mockResolvedValueOnce(data);

        await expect(provider.getFeatures()).rejects.toBe(error);
        await expect(provider.getFeatures()).resolves.toEqual(data);
        expect(provider.fetch).toHaveBeenCalledTimes(2);
    });
});
