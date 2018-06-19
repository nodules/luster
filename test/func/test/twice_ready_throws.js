/* globals describe,it,before,after,Promise,assert */
'use strict';

const fork = require('child_process').fork,
    path = require('path');

describe('Worker#ready()', () => {
    let instance;

    beforeEach(() => {
        instance = fork(path.resolve(__dirname, '../fixtures/twice_ready_throws/master.js'));
    });

    it('should throw if worker is already in the ready state', () => {
        return new Promise((resolve, reject) => {
            let done = false;
            instance
                .once('message', message => {
                    assert.equal(message, 'already_ready', 'Expected only an "already_ready" message');
                    done = true;
                    resolve();
                })
                .once('exit', () => {
                    assert(done, 'Second Worker#ready() does not throw ALREADY_READY error');
                    reject();
                });
        });
    });

    afterEach(() => {
        instance.kill();
    });
});
