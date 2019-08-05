#!/usr/bin/env node

const handler = require('serve-handler');
const http = require('http');
const https = require('https');
const commander = require('commander');
const pem = require('pem');
const pkg = require('./package.json');
const { readFileSync, writeFileSync, accessSync, F_OK } = require('fs');

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

    const mergedConfig = mergeConfigWithEnvVariables(parsedConfig, process.env);
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
