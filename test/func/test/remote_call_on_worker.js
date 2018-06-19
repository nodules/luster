/* globals describe,it,before,after,assert */
'use strict';

const LusterInstance = require('../helpers/luster_instance');

describe('remote calls on worker', () => {
    let instance;

    beforeEach(() => {
        return LusterInstance
            .run('../fixtures/remote_call_on_worker/master.js')
            .then(inst => instance = inst);
    });

    it('should allow worker to call master', done => {
        setTimeout(() => {
            assert.equal(instance.output(), '3\n4\n');
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
