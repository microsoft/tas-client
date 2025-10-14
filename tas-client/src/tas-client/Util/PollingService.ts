/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class PollingService {
    private intervalHandle?: any;
    public onTick: (() => Promise<void>) | undefined;

    constructor(private fetchInterval: number) {}

    public StopPolling(): void {
        clearInterval(this.intervalHandle);
        this.intervalHandle = undefined;
    }

    public OnPollTick(callback: () => Promise<void>) {
        this.onTick = callback;
    }

    public StartPolling(pollImmediately = false) {
        if (this.intervalHandle) {
            this.StopPolling();
        }

        // If there's no callback, there's no point to start polling.
        if (this.onTick == null) {
            return;
        }

        if (pollImmediately) {
            this.onTick!()
                .then(() => {
                    return;
                })
                .catch(() => {
                    return;
                });
        }

        /**
         * Set the interval to start running.
         */
        this.intervalHandle = setInterval(async () => {
            await this.onTick!();
        }, this.fetchInterval);
        if (this.intervalHandle.unref) {
            // unref is only available in Node, not the web
            this.intervalHandle.unref(); // unref is used to avoid keeping node.js alive only because of these timeouts.
        }
    }
}
