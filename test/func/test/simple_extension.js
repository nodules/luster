/* globals describe,it,before,after,assert */
'use strict';

const LusterInstance = require('../helpers/luster_instance');

describe('simple extension', () => {
    let instance;

    beforeEach(() => {
        return LusterInstance
            .run('../fixtures/simple_extension/master.js')
            .then(inst => instance = inst);
    });

    it('should have access to configuration', done => {
        const expected = [
            'luster-simple extension configured on master process',
            'param1 = 1',
            'param2 = World',
            'luster-simple extension configured on worker process #1',
            'param1 = 1',
            'param2 = World\n'
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
