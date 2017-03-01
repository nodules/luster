/* globals describe,it,before,after,assert */
'use strict';

var LusterInstance = require('../helpers/luster_instance');

describe('emitToAll', function() {
    var instance;

    before(function() {
        return LusterInstance
            .run('../fixtures/emit_to_all/master.js')
            .then(function (inst) {
                instance = inst;
            });
    });

    it('should deliver message data to all workers', function(done) {
        setTimeout(function() {
            assert.equal(instance.output(), 'test\ntest\n');
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
