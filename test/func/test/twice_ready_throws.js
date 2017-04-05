/* globals describe,it,before,after,Promise,assert */
'use strict';

var fork = require('child_process').fork,
    path = require('path');

describe('Worker#ready()', function() {
    var instance;

    beforeEach(function() {
        instance = fork(path.resolve(__dirname, '../fixtures/twice_ready_throws/master.js'));
    });

    it('should throw if worker is already in the ready state', function() {
        return new Promise(function(resolve, reject) {
            var done = false;
            instance
                .once('message', function(message) {
                    assert.equal(message, 'already_ready', 'Expected only an "already_ready" message');
                    done = true;
                    resolve();
                })
                .once('exit', function() {
                    assert(done, 'Second Worker#ready() does not throw ALREADY_READY error');
                    reject();
                });
        });
    });

    afterEach(function() {
        instance.kill();
    });
});
