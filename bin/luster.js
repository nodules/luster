#!/usr/bin/env node
var /** @type {ClusterProcess} */
    luster = require('../lib/luster'),
    path = require('path'),
    configFilePath = path.resolve(process.cwd(), process.argv[2] || 'luster.conf');

luster.configure(require(configFilePath), true, path.dirname(configFilePath)).run();
