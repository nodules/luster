/* globals describe,it,before,after,assert */
'use strict';

const LusterInstance = require('../helpers/luster_instance');

describe('remote calls on worker', function() {
    let instance;

    beforeEach(function() {
        return LusterInstance
            .run('../fixtures/remote_call_on_worker/master.js')
            .then(function (inst) {
                instance = inst;
            });
    });

    it('should allow worker to call master', function(done) {
        setTimeout(function() {
            assert.equal(instance.output(), '3\n4\n');
            done();
        }, 100);
    });

    afterEach(function() {
        if (instance) {
            instance.kill();
            instance = null;
        }
    });
});
