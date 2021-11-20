/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as Mocha from 'mocha';

export function run(testsRoot: string, cb: (error: any, failures?: number) => void): void {
	const mocha = new Mocha({
		ui: 'tdd'
	});
    
    mocha.addFile(path.resolve(testsRoot, 'general.test.js'));

    try {
        mocha.run(failures => {
            cb(null, failures);
        });
    } catch (err) {
        console.error(err);
        cb(err);
    }
}
