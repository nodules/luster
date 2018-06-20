/* globals describe,it,before,after */
'use strict';

const LusterInstance = require('../helpers/luster_instance');

describe('stopTimeout', () => {
    let instance;

    beforeEach(async () => {
        instance = await LusterInstance
            .run('../fixtures/force_kill/master.js');
    });

    it('should kill infinite worker', async () => {
        await instance.sendWaitTimeout('hang', 10);
        await instance.sendWaitAnswer('restart', 'restarted');
        await instance.sendWaitAnswer('request', 'response');
    });

    it('should kill infinite worker that disconnected itself', async () => {
        await instance.sendWaitAnswer('disconnect and hang', 'disconnected');
        await instance.sendWaitAnswer('wait worker', 'worker ready');
        await instance.sendWaitAnswer('request', 'response');
    });

    afterEach(() => {
        if (instance) {
            instance.kill();
            instance = null;
        }
    });
});
