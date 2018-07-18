/* globals describe,it,before,after,assert */
'use strict';

const LusterInstance = require('../helpers/luster_instance');

describe('shutdown event', () => {
    let instance;

    beforeEach(async () => {
        instance = await LusterInstance
            .run('../fixtures/double_shutdown/master.js');
    });

    it('should be emitted only once for shutdown method', async () => {
        instance.send('shutdown');
        await instance.exited;
        assert.equal(instance.output(), 'shutdown\n');
    });

    afterEach(() => {
        if (instance) {
            instance.kill();
            instance = null;
        }
    });
});
