#!/usr/bin/env node

import handler from 'serve-handler';
import * as http from 'node:http';
import * as https from 'node:https';
import commander from 'commander';
import pem from 'pem';
import { readFileSync, writeFileSync, accessSync, F_OK } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Read package.json version without JSON import assertions for broad Node compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json')).toString());

const CIPHERS = [
    'ECDHE-RSA-AES128-SHA256',
    'DHE-RSA-AES128-SHA256',
    'AES128-GCM-SHA256',
    'RC4',
    'HIGH',
    '!MD5',
    '!aNULL'
].join(':');

commander
    .command('env-serve')
    .version(pkg.version)
    .option('-v, --version', 'output the version number')
    .option('-g, --global [globalName]', 'global variable name eg. window.yourName', 'appConfig')
    .option('-c, --cert [pathToCert]', 'path to cert file')
    .option('-C, --ca [pathToCa]', 'path to ca file')
    .option('-S, --https [pathToCa]', 'is https mode', false)
    .option('-k, --cert-key [pathToCertKey]', 'path to cert key file')
    .option('-p, --port [port]', 'port', 3000)
    .option('-f, --config-file [configFile]', 'file where config exists', 'index.html')
    .option('-s, --self-signed [selfSigned]', 'generate self signed certificate for server')
    .option('-o, --option [key=value]', 'override config option, may be repeated (e.g. --option "apiUrl=http://localhost:5000")', (val, memo) => { memo.push(val); return memo; }, [])
    .parse(process.argv);

const command = commander.commands[0];

const pathToConfig = `${process.cwd()}/${command.configFile}`;

const {
    ca: pathToCa,
    certKey: pathToCertKey,
    cert: pathToCert,
    https: httpsMode,
    global: globalName,
    port,
    selfSigned
} = command;

const isHTTPS = httpsMode || selfSigned;

let server;

async function requestHandler(request, response) {
    await handler(request, response, {
        public: process.cwd()
    });
}

const readParsers = {
    json: jsonString => JSON.parse(jsonString),
    js: jsString => {
        const regex = new RegExp(`${globalName}\\s{0,}=\\s{0,}{(.+?)}`, 'gms');
        const startNameRegex = new RegExp(`${globalName}\\s+?=\\s+?`, 'gms');

        const match = jsString.match(regex);

        if (!match)
            throw new Error('Can not find valid configuration in passed js string');

        try {
            return eval(`(${match[0].replace(startNameRegex, '')})`);
        }
        catch (e) {
            throw new Error('Wrong configuration format')
        }
    },
    html: function(...args) { return this.js(...args) }
};

const writeParsers = {
    json: (fileContent, config) => {
        return JSON.stringify(config, null, 4);
    },
    js: (fileContent, config) => {
        const regex = new RegExp(`${globalName}\\s{0,}=\\s{0,}{(.+?)}`, 'gms');
        const bodyRegex = new RegExp(`{(.+?)}`, 'gms');
        const configString = JSON.stringify(config, null, 4);

        const matchedMainConfig = fileContent.match(regex);

        if (!matchedMainConfig)
            throw new Error(`Can't parse js configuration for write`);

        const matchedConfigBody = matchedMainConfig[0].match(bodyRegex);

        return fileContent.replace(matchedConfigBody[0], configString);
    },
    html: function(...args) { return this.js(...args) }
};

function extractFileType(path) {
    const [, extension] = path.split('.');

    return extension;
}

function mergeConfigWithEnvVariables(config, env) {
    return Object.entries(config).reduce((acc, [key, val]) => {
        const newVal = env.hasOwnProperty(key) ? env[key] : val;

        return {
            ...acc,
            [key]: newVal
        };
    }, {});
}

function parseOptionValue(val) {
    const t = (typeof val === 'string') ? val.trim() : val;
    if (typeof t !== 'string') return t;
    if (t === 'true') return true;
    if (t === 'false') return false;
    if (t === 'null') return null;
    if (/^-?\d+(?:\.\d+)?$/.test(t)) return Number(t);
    if ((t.startsWith('{') || t.startsWith('[') || t.startsWith('"')) && t.endsWith('}')) {
        try { return JSON.parse(t); } catch (e) { /* ignore */ }
    }
    if (t.startsWith('{') || t.startsWith('[')) {
        try { return JSON.parse(t); } catch (e) { /* ignore */ }
    }
    return t;
}

function setDeep(obj, path, value) {
    const parts = path.split('.').filter(Boolean);
    if (parts.length === 0) return obj;
    let cursor = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (typeof cursor[p] !== 'object' || cursor[p] === null) {
            cursor[p] = {};
        }
        cursor = cursor[p];
    }
    cursor[parts[parts.length - 1]] = value;
    return obj;
}

function applyOptionsToConfig(config, optionsArr) {
    if (!Array.isArray(optionsArr)) return config;
    return optionsArr.reduce((acc, entry) => {
        if (typeof entry !== 'string') return acc;
        const idx = entry.indexOf('=');
        if (idx === -1) return acc;
        const keyPath = entry.slice(0, idx).trim();
        const rawVal = entry.slice(idx + 1);
        const parsedVal = parseOptionValue(rawVal);
        return setDeep(acc, keyPath, parsedVal);
    }, { ...config });
}

function generateCertificate() {
    return new Promise((res, rej) => {
        pem.createCertificate({ days: 360, selfSigned: true }, (err, keys) => {
            if (err)
                return rej(err);

            res({
                cert: keys.certificate,
                key: keys.serviceKey
            });
        });
    });
}

async function getCertificate() {
    if (selfSigned)
        return await generateCertificate();

    const key = pathToCertKey ? readFileSync(pathToCertKey).toString() : undefined;
    const cert = pathToCert ? readFileSync(pathToCert).toString() : undefined;

    return { key, cert };
}

async function runServer() {
    if (isHTTPS) {
        const ca = pathToCa ? readFileSync(pathToCa).toString() : undefined;

        if (!selfSigned && (!pathToCertKey || !pathToCert))
            throw new Error(`For HTTPS server must be provided at least key and cert`);

        const {
            cert,
            key
        } = await getCertificate();

        const options = {
            ca,
            key,
            cert,
            ciphers: CIPHERS
        };

        server = https.createServer(options, requestHandler);
    }
    else {
        server = http.createServer(requestHandler);
    }

    server.listen(port);
}

function isFileExists(path) {
    try {
        accessSync(path, F_OK);
        return true;
    }
    catch (e) {
        return false;
    }
}

function main() {
    const fileType = extractFileType(pathToConfig);

    if (!readParsers[fileType] || !writeParsers[fileType]) {
        console.log(`Unsupported file type ${fileType}`);
        process.exit(1);
    }

    if (!isFileExists(pathToConfig)) {
        console.log(`Can't find config config file under path ${pathToConfig}`);
        process.exit(1);
    }

    const rawFileContent = readFileSync(pathToConfig).toString();
    const parsedConfig = readParsers[fileType](rawFileContent);

    // Merge from env vars
    let mergedConfig = mergeConfigWithEnvVariables(parsedConfig, process.env);

    // Apply command-line overrides
    const cliOptions = Array.isArray(command['option']) ? command['option'] : [];
    mergedConfig = applyOptionsToConfig(mergedConfig, cliOptions);

    const rawMergedFileContent = writeParsers[fileType](rawFileContent, mergedConfig);

    writeFileSync(pathToConfig, rawMergedFileContent);

    try {
        runServer();
        console.log(`Server url: http${(isHTTPS) ? 's' : ''}://localhost:${port}\nConfig:\n${JSON.stringify(mergedConfig, null, 4)}`);
    }
    catch (e) {
        console.log(e.message);
        process.exit(1);
    }

}

main();
