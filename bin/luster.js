#!/usr/bin/env node
var legacy = require('../lib/legacy'),
    domain = require('domain').create();

domain.on('error', function(error) {
    var fs = require('fs'),
        path = require('path'),
        dumpFilePath = path.resolve(
            legacy.tmpdir(),
            'luster-dump-' + process.pid + '-' +
                (new Date()).toISOString().replace(/[^\dTZ]/g, '-'));

    fs.writeFileSync(dumpFilePath,
        (error instanceof Error) ?
            error.message + '\n' + error.stack :
            error);

    process.exit(1);
});

domain.run(function() {
    var /** @type {ClusterProcess} */
        luster = require('../lib/luster'),
        path = require('path'),
        configFilePath = path.resolve(process.cwd(), process.argv[2] || 'luster.conf');

    luster.configure(require(configFilePath), true, path.dirname(configFilePath)).run();
});
