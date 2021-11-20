/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var gulp = require('gulp');
var nbgv = require('nerdbank-gitversioning');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');

const outDir = './out';
const packageJsonFile = path.join(__dirname, 'package.json');
const packageDir = path.join(__dirname, 'out', 'pkg');
const readFile = util.promisify(fs.readFile);
const mkdir = util.promisify(fs.mkdir);
const rename = util.promisify(fs.rename);

function getPackageFileName(packageJson, buildVersion) {
    return `${packageJson.name.replace('@', '').replace('/', '-')}-${buildVersion}.tgz`;
}

function executeCommand(cwd, command) {
    console.log(command);
    return new Promise(function(resolve, reject) {
        const p = cp.exec(command, { cwd: cwd }, (err) => {
            if (err) {
                err.showStack = false;
                reject(err);
            }
            resolve();
        });
        p.stdout.pipe(process.stdout);
        p.stderr.pipe(process.stderr);
    });
}

async function mkdirp(dir) {
    try {
        await mkdir(dir);
    } catch (e) {
        if (e.code !== 'EEXIST') throw e;
    }
}

gulp.task('copyPackageContents', function() {
    return gulp.src(['package.json']).pipe(gulp.dest(outDir));
});

gulp.task('setPackageVersion', function() {
    return nbgv.setPackageVersion(outDir, '.');
});

gulp.task('compile', function() {
    return executeCommand(__dirname, 'npm run compile');
});

gulp.task('pack', async function() {
    const packageJson = JSON.parse(await readFile(packageJsonFile));

    await executeCommand(outDir, `npm pack`);
    await mkdirp(packageDir);

    const packageFileName = getPackageFileName(
        packageJson,
        (await nbgv.getVersion(outDir)).npmPackageVersion,
    );
    await rename(path.join(outDir, packageFileName), path.join(packageDir, packageFileName));
});

gulp.task('publish', async function() {
    const packageJson = JSON.parse(await readFile(packageJsonFile));
    const packageFileName = getPackageFileName(
        packageJson,
        (await nbgv.getVersion(outDir)).npmPackageVersion,
    );
    const packageFilePath = path.join(packageDir, packageFileName);
    const publishCommand = `npm publish "${packageFilePath}"`;
    await executeCommand(__dirname, publishCommand);
});

gulp.task(
    'pack-publish',
    gulp.series(['compile', 'copyPackageContents', 'setPackageVersion', 'pack', 'publish']),
    function() {
        return new Promise(function(resolve, reject) {
            resolve();
        });
    },
);

gulp.task(
    'test-pack-publish',
    gulp.series(['compile', 'copyPackageContents', 'setPackageVersion', 'pack']),
    function() {
        return new Promise(function(resolve, reject) {
            resolve();
        });
    },
);
