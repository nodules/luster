/* globals describe,it,before,after,Promise,assert */
'use strict';

const fork = require('child_process').fork,
    path = require('path');

describe('manualReady option', function() {
    let instance;

    beforeEach(function() {
        instance = fork(path.resolve(__dirname, '../fixtures/manual_ready/master.js'));
    });

    it('should fire running when workers are ready', function() {
        return new Promise(function(resolve) {
            const start = process.hrtime();
            instance.once('message', function(message) {
                assert.equal(message, 'ready', 'Got unexpected response from server');
                const hrTimeDiff = process.hrtime(start);
                const diff = hrTimeDiff[0] + hrTimeDiff[1] / 1e9;
                assert.isAtLeast(diff, 0.5, 'Running event is fired too early');
                resolve();
            });
        });
    });

    afterEach(function() {
        instance.kill();
    });
});
