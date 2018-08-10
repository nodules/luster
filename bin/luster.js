#!/usr/bin/env node
const /** @type {ClusterProcess} */
    luster = require('../lib/luster'),
    path = require('path');

// config path is right after this script in process.argv
const scriptArgvIndex = process.argv.findIndex(arg => arg === __filename || path.resolve(arg) === __filename);
const configFilePath = path.resolve(process.cwd(), process.argv[scriptArgvIndex + 1] || 'luster.conf');

luster.configure(require(configFilePath), true, path.dirname(configFilePath)).run();
