/* globals describe,it,before,after,assert */
'use strict';

const LusterInstance = require('../helpers/luster_instance');

describe('async extension', () => {
    let instance;

    beforeEach(async () => {
        instance = await LusterInstance
            .run('../fixtures/async_extension/master.js');
    });

    it('should have access to configuration and delay initialized event', done => {
        const expected = [
            'luster-async extension configured on master process',
            'param1 = 2',
            'param2 = Hello',
            'master is initialized',
            'luster-async extension configured on worker process #1',
            'param1 = 2',
            'param2 = Hello',
            'worker process #1 has started\n'
        ].join('\n');
        setTimeout(() => {
            assert.equal(instance.output(), expected);
            done();
        }, 100);
    });

    afterEach(() => {
        if (instance) {
            instance.kill();
            instance = null;
        }
    });
});
