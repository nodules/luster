#!/usr/bin/env node
var domain = require('domain').create(),
    path = require('path'),
    configFilePath;

domain.on('error', function(error) {
    process.stderr.write('Luster error [' + configFilePath + ']: ' +
        (error instanceof Error ?
            error.message + '\n' + error.stack :
            error));

    process.exit(1);
});

domain.run(function() {
    var /** @type {ClusterProcess} */
        luster = require('../lib/luster'),
        configFilePath = path.resolve(process.cwd(), process.argv[2] || 'luster.conf');

    luster.configure(require(configFilePath), true, path.dirname(configFilePath)).run();
});
