/* globals describe,it,before,after,assert */
'use strict';

var LusterInstance = require('../helpers/luster_instance');

describe('async extension', function() {
    var instance;

    before(function() {
        return LusterInstance
            .run('../fixtures/async_extension/master.js')
            .then(function (inst) {
                instance = inst;
            });
    });

    it('should have access to configuration and delay initialized event', function(done) {
        var expected = [
            'luster-async extension configured on master process',
            'param1 = 2',
            'param2 = Hello',
            'master is initialized',
            'luster-async extension configured on worker process #1',
            'param1 = 2',
            'param2 = Hello',
            'worker process #1 has started\n'
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
