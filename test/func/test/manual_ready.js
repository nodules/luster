/* globals describe,it,before,after,assert */
'use strict';

const fork = require('child_process').fork,
    path = require('path');

describe('manualReady option', () => {
    let instance;

    beforeEach(() => {
        instance = fork(path.resolve(__dirname, '../fixtures/manual_ready/master.js'));
    });

    it('should fire running when workers are ready', () => {
        return new Promise(resolve => {
            const start = process.hrtime();
            instance.once('message', message => {
                assert.equal(message, 'ready', 'Got unexpected response from server');
                const hrTimeDiff = process.hrtime(start);
                const diff = hrTimeDiff[0] + hrTimeDiff[1] / 1e9;
                assert.isAtLeast(diff, 0.5, 'Running event is fired too early');
                resolve();
            });
        });
    });

    afterEach(() => instance.kill());
});
