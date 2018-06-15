#!/usr/bin/env node
const /** @type {ClusterProcess} */
    luster = require('../lib/luster'),
    path = require('path'),
    configFilePath = path.resolve(process.cwd(), process.argv[2] || 'luster.conf');

luster.configure(require(configFilePath), true, path.dirname(configFilePath)).run();
