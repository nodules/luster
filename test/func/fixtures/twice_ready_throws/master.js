'use strict';
var proc = require('luster');

proc
    .configure({
        app: 'worker.js',
        workers: 1,
        control: {
            stopTimeout: 100,
            allowedSequentialDeaths: 0,
            exitThreshold: 10000,
            triggerReadyStateManually: true,
        }
    }, true, __dirname)
    .run();

if (proc.isMaster) {
    proc.registerRemoteCommand('already_ready', function() {
        process.send('already_ready');
    });
}
