/* globals describe,it,before,after,assert */
'use strict';

const LusterInstance = require('../helpers/luster_instance');

describe('remote calls on master', () => {
    let instance;

    beforeEach(() => {
        return LusterInstance
            .run('../fixtures/remote_call_on_master/master.js')
            .then(inst => instance = inst);
    });

    it('should allow master to call worker', done => {
        setTimeout(() => {
            assert.equal(instance.output(), '1\n2\n');
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
