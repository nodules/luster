/* globals describe,it,before,after,Promise,assert */
'use strict';

var fork = require('child_process').fork,
    path = require('path');

describe('manualReady option', function() {
    var instance;

    before(function() {
        instance = fork(path.resolve(__dirname, '../fixtures/manual_ready/master.js'));
    });

    it('should fire running when workers are ready', function() {
        return new Promise(function(resolve) {
            var start = process.hrtime();
            instance.once('message', function(message) {
                assert.equal(message, 'ready', 'Got unexpected response from server');
                var diff = process.hrtime(start);
                diff = diff[0] + diff[1] / 1e9;
                assert.isAtLeast(diff, 0.5, 'Running event is fired too early');
                resolve();
            });
        });
    });

    after(function() {
        instance.kill();
    });
});
