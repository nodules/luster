/* globals describe,it,before,after */
'use strict';

const { assert } = require('chai');
const LusterInstance = require('../helpers/luster_instance');

describe('stopTimeout and killTimeout', () => {
    let instance;

    describe('without SIGKILL timeout setting', () => {
        it('should fail to kill infinite worker', async () => {
            instance = await LusterInstance
                .run('../fixtures/force_kill_sigkill/master.js');

            const action = async () => {
                // send hang without
                await instance.sendWaitTimeout('hang', 10);
                await instance.sendWaitAnswer('restart', 'restarted');
                await instance.sendWaitAnswer('request', 'response');
            };

            // complicated code required because I can't just use it.fail to say I expect this test to fail,
            // mocha has no such feature (jest has)
            let finishedManually = false;
            await Promise.race([
                action(),
                new Promise(resolve => setTimeout(() => {
                    finishedManually = true;
                    resolve();
                }, 1500))
            ]);

            assert.equal(finishedManually, true);
        });

        it('should kill infinite worker that disconnected itself', async () => {
            instance = await LusterInstance
                .run('../fixtures/force_kill_sigkill/master.js');

            const action = async () => {
                await instance.sendWaitAnswer('disconnect and hang', 'disconnected');
                await instance.sendWaitAnswer('wait worker', 'worker ready');
                await instance.sendWaitAnswer('request', 'response');
            };

            // complicated code required because I can't just use it.fail to say I expect this test to fail,
            // mocha has no such feature (jest has)
            let finishedManually = false;
            await Promise.race([
                action(),
                new Promise(resolve => setTimeout(() => {
                    finishedManually = true;
                    resolve();
                }, 1500))
            ]);
            assert.equal(finishedManually, true);
        });
    });

    describe('with SIGKILL timeout setting', () => {
        it('should kill infinite worker without', async () => {
            instance = await LusterInstance
                .run('../fixtures/force_kill_sigkill/master_sigkill.js');

            await instance.sendWaitTimeout('hang', 10);
            await instance.sendWaitAnswer('restart', 'restarted');
            await instance.sendWaitAnswer('request', 'response');
        });

        it('should kill infinite worker that disconnected itself', async () => {
            instance = await LusterInstance
                .run('../fixtures/force_kill_sigkill/master_sigkill.js');

            await instance.sendWaitAnswer('disconnect and hang', 'disconnected');
            await instance.sendWaitAnswer('wait worker', 'worker ready');
            await instance.sendWaitAnswer('request', 'response');
        });
    });

    afterEach(() => {
        if (instance) {
            instance.kill();
            instance = null;
        }
    });

    after(async () => {
        if (instance) {
            await instance.kill();
            instance = null;
        }
    });
});
