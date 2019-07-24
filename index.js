#!/usr/bin/env node

const handler = require('serve-handler');
const http = require('http');
const https = require('https');
const commander = require('commander');
const pkg = require('./package.json');
const { readFileSync } = require('fs');

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
    .command('serve-with-config [html] [js]')
    .version(pkg.version)
    .option('-v, --version', 'output the version number')
    .option('-g, --global [globalName]', 'Global variable name eg. window.yourName', 'appConfig')
    .option('-c, --cert [pathToCert]', 'Path to cert file')
    .option('-C, --ca [pathToCa]', 'Path to ca file')
    .option('-S, --https [pathToCa]', 'Is https mode', false)
    .option('-k, --key [pathToKey]', 'Path to cert key file')
    .option('-p, --port [port]', 'port', 3000)
    .parse(process.argv);

const command = commander.commands[0];

const [
    pathToHTML = `${process.cwd()}/index.html`,
    pathToConfig = `${process.cwd()}/config.js`
] = command.args;

console.log(pathToConfig);

const {
    ca: pathToCa,
    key: pathToKey,
    cert: pathToCert,
    https: httpsMode,
    global: globalName,
    port
} = command;

let server;

async function requestHandler(request, response) {
    await handler(request, response, {
        public: __dirname+'/public'
    });
}

const parsers = {
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
    }
};

function extractFileType(path) {
    const [, extension] = path.split('.');

    return extension;
}

function extractConfigFromFile(pathToFile) {
    const fileType = extractFileType(pathToFile);

    if (!parsers[fileType])
        throw new Error(`Unsupported filetype ${fileType}`);

    const fileContent = readFileSync(pathToFile).toString();

    return parsers[fileType](fileContent);
}

console.log(extractConfigFromFile(pathToConfig));

if (httpsMode) {
    const ca = pathToCa ? readFileSync(pathToCa).toString() : undefined;
    const key = pathToKey ? readFileSync(pathToKey).toString() : undefined;
    const cert = pathToCert ? readFileSync(pathToCert).toString() : undefined;

    if (!pathToKey || !pathToCert)
        throw new Error(`For HTTPS server must be provided at least key and cert`);

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

// server.listen(port);

console.log(`Server url: http${httpsMode ? 's' : ''}://localhost:${port}`);
