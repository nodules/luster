/* globals describe,it,before,after,assert */
'use strict';

var LusterInstance = require('../helpers/luster_instance');

describe('simple extension', function() {
    var instance;

    before(function() {
        return LusterInstance
            .run('../fixtures/simple_extension/master.js')
            .then(function (inst) {
                instance = inst;
            });
    });

    it('should have access to configuration', function(done) {
        var expected = [
            'luster-simple extension configured on master process',
            'param1 = 1',
            'param2 = World',
            'luster-simple extension configured on worker process #1',
            'param1 = 1',
            'param2 = World\n'
        ].join('\n');
        setTimeout(function() {
            assert.equal(instance.output(), expected);
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
