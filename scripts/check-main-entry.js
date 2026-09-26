const fs = require('fs');
const path = require('path');

const main = require('../package.json').main;

if (!main) {
    console.error('package.json has no "main" entry');
    process.exit(1);
}

const mainFile = path.resolve(__dirname, '..', main);

if (!fs.existsSync(mainFile)) {
    console.error(`package.json "main" points at a missing file: ${main}`);
    process.exit(1);
}

try {
    require(mainFile);
} catch (err) {
    console.error(`package.json "main" is not loadable: ${main}: ${err.message}`);
    process.exit(1);
}

console.log(`package main entry is loadable: ${main}`);
