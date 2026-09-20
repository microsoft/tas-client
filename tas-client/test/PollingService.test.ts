/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PollingService } from '../src/tas-client/Util/PollingService.js';

describe('PollingService', () => {
    let polling: PollingService;

    beforeEach(() => {
        vi.useFakeTimers();
        polling = new PollingService(1000);
    });

    afterEach(() => {
        polling.StopPolling();
        vi.unstubAllGlobals();
        const remainingTimers = vi.getTimerCount();
        vi.useRealTimers();
        expect(remainingTimers).toBe(0);
    });

    it('does not allocate an interval without a callback and can stop before starting', () => {
        polling.StopPolling();
        polling.StartPolling(true);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('waits for the first interval unless immediate polling is requested', async () => {
        const tick = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        polling.OnPollTick(tick);
        polling.StartPolling();
        expect(tick).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(999);
        expect(tick).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(tick).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(tick).toHaveBeenCalledTimes(2);
    });

    it('runs immediately and contains an initial rejection so a later tick can succeed', async () => {
        const tick = vi
            .fn<() => Promise<void>>()
            .mockRejectedValueOnce(new Error('Initial request failed'))
            .mockResolvedValue(undefined);
        polling.OnPollTick(tick);
        polling.StartPolling(true);
        expect(tick).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(1000);
        expect(tick).toHaveBeenCalledTimes(2);
        expect(vi.getTimerCount()).toBe(1);
    });

    it('restarts rather than duplicates the interval on repeated starts', async () => {
        const tick = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        polling.OnPollTick(tick);
        polling.StartPolling(true);
        await vi.advanceTimersByTimeAsync(500);
        polling.StartPolling();

        await vi.advanceTimersByTimeAsync(500);
        expect(tick).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(500);
        expect(tick).toHaveBeenCalledTimes(2);
        expect(vi.getTimerCount()).toBe(1);
    });

    it('stops future ticks and tolerates repeated disposal', async () => {
        const tick = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        polling.OnPollTick(tick);
        polling.StartPolling(true);
        polling.StopPolling();
        polling.StopPolling();

        await vi.advanceTimersByTimeAsync(10_000);
        expect(tick).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('uses an updated callback on the next tick', async () => {
        const first = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const replacement = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        polling.OnPollTick(first);
        polling.StartPolling(true);
        polling.OnPollTick(replacement);

        await vi.advanceTimersByTimeAsync(1000);
        expect(first).toHaveBeenCalledTimes(1);
        expect(replacement).toHaveBeenCalledTimes(1);
    });

    it('unrefs Node timers so polling does not keep a process alive', () => {
        const unref = vi.fn();
        const setInterval = vi.fn(() => ({ unref }));
        vi.stubGlobal('setInterval', setInterval);
        vi.stubGlobal('clearInterval', vi.fn());
        polling.OnPollTick(async () => {});

        polling.StartPolling();

        expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 1000);
        expect(unref).toHaveBeenCalledTimes(1);
    });

    it('supports browsers whose interval handles are numbers rather than Node timer objects', async () => {
        const setInterval = vi
            .fn<(callback: () => Promise<void>, interval: number) => number>()
            .mockReturnValue(42);
        const clearInterval = vi.fn();
        const tick = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        vi.stubGlobal('setInterval', setInterval);
        vi.stubGlobal('clearInterval', clearInterval);
        polling.OnPollTick(tick);

        polling.StartPolling();
        await setInterval.mock.calls[0][0]();
        polling.StopPolling();

        expect(tick).toHaveBeenCalledTimes(1);
        expect(clearInterval).toHaveBeenCalledWith(42);
    });
});
