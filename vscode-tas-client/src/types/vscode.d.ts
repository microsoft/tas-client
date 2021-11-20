/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export namespace env {
		/**
		 * Indicates whether the users has telemetry enabled.
		 * Can be observed to determine if the extension should send telemetry.
		 */
		export const isTelemetryEnabled: boolean;
	}
}