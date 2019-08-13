/* globals describe,it,before,after,assert */
'use strict';

const LusterInstance = require('../helpers/luster_instance');
const delay = require('delay');

describe('dead workers', () => {
    let instance;

    beforeEach(async () => {
        instance = await LusterInstance
            .run('../fixtures/dead_workers/master.js');
    });

    it('worker quitting before exitThreshold should be marked as dead', async () => {
        await instance.sendWaitTimeout('worker quit', 50);

        const expectedEvents = 'Worker 1 has exited, dead is true\n';
        assert.equal(instance.output(), expectedEvents);
    });

    it('worker quitting after exitThreshold should not be marked as dead', async () => {
        await delay(50);
        await instance.sendWaitTimeout('worker quit', 50);

        const expectedEvents = 'Worker 1 has exited, dead is false\n';
        assert.equal(instance.output(), expectedEvents);
    });

    it('worker restarted manually should not be marked as dead', async () => {
        await instance.sendWaitTimeout('worker restart', 50);

        const expectedEvents = 'Worker 1 has exited, dead is false\n';
        assert.equal(instance.output(), expectedEvents);
    });

    it('worker stopped manually should not be marked as dead', async () => {
        await instance.sendWaitTimeout('worker stop', 50);

        const expectedEvents = 'Worker 1 has exited, dead is false\n';
        assert.equal(instance.output(), expectedEvents);
    });

    afterEach(() => {
        if (instance) {
            instance.kill();
            instance = null;
        }
    });
});
