/* globals describe,it,before,after,assert */
'use strict';

var LusterInstance = require('../helpers/luster_instance');

describe('worker logs', function() {
    var instance;

    beforeEach(function() {
        return LusterInstance
            .run('../fixtures/worker_logs/master.js', {NODE_DEBUG: 'luster:eex'})
            .then(function (inst) {
                instance = inst;
            });
    });

    it('should use constant id even after restart', function(done) {
        setTimeout(function() {
            var lines = instance.output().split('\n');
            lines.forEach(function(line) {
                var match = /^Worker\((\d+)\)/.exec(line);
                if (match) {
                    var id = parseInt(match[1], 10);
                    assert.strictEqual(id, 1);
                }
            });
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
