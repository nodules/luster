/* globals describe,it,before,after,assert */
'use strict';

const LusterInstance = require('../helpers/luster_instance');

describe('emitToAll', () => {
    let instance;

    beforeEach(() => {
        return LusterInstance
            .run('../fixtures/emit_to_all/master.js')
            .then(inst => instance = inst);
    });

    it('should deliver message data to all workers', done => {
        setTimeout(() => {
            assert.equal(instance.output(), 'test\ntest\n');
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
