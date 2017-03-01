/* globals describe,it,before,after,assert */
'use strict';

var LusterInstance = require('../helpers/luster_instance');

describe('remote calls on worker', function() {
    var instance;

    before(function() {
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

    after(function() {
        if (instance) {
            instance.kill();
            instance = null;
        }
    });
});
