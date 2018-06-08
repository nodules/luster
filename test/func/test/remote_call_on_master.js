/* globals describe,it,before,after,assert */
'use strict';

const LusterInstance = require('../helpers/luster_instance');

describe('remote calls on master', function() {
    let instance;

    beforeEach(function() {
        return LusterInstance
            .run('../fixtures/remote_call_on_master/master.js')
            .then(function (inst) {
                instance = inst;
            });
    });

    it('should allow master to call worker', function(done) {
        setTimeout(function() {
            assert.equal(instance.output(), '1\n2\n');
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
