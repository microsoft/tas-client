const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const nbgv = require('nerdbank-gitversioning');
const util = require('util');

const outDir = './out/src';
const packageJsonFile = path.join(__dirname, 'package.json');
const packageDir = path.join(__dirname, 'out', 'pkg');

function getPackageFileName(packageJson, buildVersion) {
    return `${packageJson.name.replace('@', '').replace('/', '-')}-${buildVersion}.tgz`;
}

function executeCommand(cwd, command) {
    console.log(command);
    return new Promise(function (resolve, reject) {
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

function mkdirp(dir) {
    fs.mkdir(dir, { recursive: true }, (err) => {
        if (err && err.code !== 'EEXIST') {
            console.error('Error occurred while creating directory:', err);
        }
    });
}

async function compileTask() {
    return executeCommand(__dirname, 'npm run compile');
}

async function copyPackageContents() {
    const sourceFile = packageJsonFile;
    await util.promisify(fs.mkdir)(packageDir, { recursive: true });
    const destinationFile = path.join(outDir, 'package.json');
    await util.promisify(fs.copyFile)(sourceFile, destinationFile);
    console.log('package.json copied successfully to outDir');
}

function setPackageVersion() {
    return nbgv.setPackageVersion(outDir, '.');
}

async function packTask() {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonFile));

    await executeCommand(outDir, `npm pack`);
    mkdirp(packageDir);

    const packageFileName = getPackageFileName(
        packageJson,
        (await nbgv.getVersion(outDir)).npmPackageVersion,
    );
    fs.renameSync(path.join(outDir, packageFileName), path.join(packageDir, packageFileName));
}

async function publishTask() {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonFile));
    const packageFileName = getPackageFileName(
        packageJson,
        (await nbgv.getVersion(outDir)).npmPackageVersion,
    );
    const packageFilePath = path.join(packageDir, packageFileName);
    const publishCommand = `npm publish "${packageFilePath}"`;
    await executeCommand(__dirname, publishCommand);
}

async function main() {
    const args = process.argv.slice(2);
    if (args.includes('--test') || args.includes('--publish')) {
        await compileTask();
        await copyPackageContents();
        await setPackageVersion();
        await packTask();
    } else {
        console.log('Invalid argument. Please use either --test or --publish');
        return;
    }

    if (args.includes('--publish')) {
        await publishTask();
    }
}

main().catch((err) => console.error(err));
