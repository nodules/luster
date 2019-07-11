/* globals describe,it,before,after,assert */
'use strict';

const LusterInstance = require('../helpers/luster_instance');

describe('suspend before stop', () => {
    let instance;

    beforeEach(async () => {
        instance = await LusterInstance
            .run('../fixtures/suspend/master.js');
    });

    it('master calls suspend and waits for it to finish before stop', async () => {
        await instance.sendWaitTimeout('register suspend 100', 10);
        await instance.sendWaitAnswer('soft-restart', 'restarted');
        const expected = `Waiting 100ms in suspend function
Finished waiting 100ms in suspend function
Got disconnect
`;
        assert.equal(instance.output(), expected);
    });

    it('master disconnected worker if no suspend function was registered', async () => {
        await instance.sendWaitAnswer('soft-restart', 'restarted');
        const expected = 'Got disconnect\n';
        assert.equal(instance.output(), expected);
    });

    it('worker waits for all registered suspend functions', async () => {
        await instance.sendWaitTimeout('register suspend 100', 10);
        await instance.sendWaitTimeout('register suspend 200', 10);
        await instance.sendWaitAnswer('soft-restart', 'restarted');
        const expected = `Waiting 100ms in suspend function
Waiting 200ms in suspend function
Finished waiting 100ms in suspend function
Finished waiting 200ms in suspend function
Got disconnect
`;
        assert.equal(instance.output(), expected);
    });

    it('master kills worker if suspend did not finish in stopTimeout', async () => {
        await instance.sendWaitTimeout('register suspend 100000', 10);
        await instance.sendWaitAnswer('soft-restart', 'restarted');
        const expected = 'Waiting 100000ms in suspend function\n';
        assert.equal(instance.output(), expected);
    });

    it('worker does not call suspend functions more than once', async () => {
        await instance.sendWaitTimeout('register suspend 100', 10);
        await instance.send('shutdown');
        const exitCode = await instance.sendWaitExit('shutdown');

        // Keep those two 'shutting down' to make sure master process got our message and called 'shutdown' twice
        const expected = `Shutting down
Shutting down
Waiting 100ms in suspend function
Finished waiting 100ms in suspend function
Got disconnect
`;
        assert.equal(exitCode, 0);
        assert.equal(instance.output(), expected);
    });

    afterEach(() => {
        if (instance) {
            instance.kill();
            instance = null;
        }
    });
});
