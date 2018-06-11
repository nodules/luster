/* globals describe,it,before,after,assert */
'use strict';

const LusterInstance = require('../helpers/luster_instance');

describe('worker logs', () => {
    let instance;

    beforeEach(() => {
        return LusterInstance
            .run('../fixtures/worker_logs/master.js', {NODE_DEBUG: 'luster:eex'})
            .then(inst => instance = inst);
    });

    it('should use constant id even after restart', done => {
        setTimeout(() => {
            const lines = instance.output().split('\n');
            lines.forEach(line => {
                const match = /^Worker\((\d+)\)/.exec(line);
                if (match) {
                    const id = parseInt(match[1], 10);
                    assert.strictEqual(id, 1);
                }
            });
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
