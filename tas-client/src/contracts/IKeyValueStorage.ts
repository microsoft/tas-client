/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Interface used for a key-value storage implementation.
 */
export interface IKeyValueStorage {
    /**
     * Gets current value from the storage.
     * @param key The key of the value that wants to be retrieved from the storage.
     * @param defaultValue The default value to return in case no value was found for given key.
     */
    getValue<T>(key: string, defaultValue?: T): Promise<T | undefined>;

    /**
     * Sets value to the storage.
     * @param key The key that will be attached to the value in the storage.
     * @param value The value to store.
     */
    setValue<T>(key: string, value: T): void;
}
