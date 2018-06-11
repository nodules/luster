'use strict';
const worker = require('luster'),
    LusterWorkerError = require('luster/lib/errors').LusterWorkerError;

worker.once('ready', () => {
    try {
        worker.ready();
    } catch(e) {
        if ((e instanceof LusterWorkerError) && e.code === LusterWorkerError.CODES.ALREADY_READY) {
            worker.remoteCall('already_ready');
        } else {
            throw e;
        }
    }
});
worker.ready();
