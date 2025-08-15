import cp from 'child_process';
import fs from 'fs';
import path from 'path';
import nbgv from 'nerdbank-gitversioning';
import util from 'util';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    
    // Read the original package.json
    const packageJson = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
    
    // Fix the paths for the published package
    packageJson.main = './index.js';
    packageJson.exports = {
        '.': {
            'types': './index.d.ts',
            'default': './index.js'
        }
    };
    
    // Write the modified package.json to the output directory
    await util.promisify(fs.writeFile)(destinationFile, JSON.stringify(packageJson, null, 2));
    console.log('package.json copied and updated successfully to outDir');
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
