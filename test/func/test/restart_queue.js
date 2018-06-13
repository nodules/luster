/* globals describe,it,before,after,assert */
'use strict';

const LusterInstance = require('../helpers/luster_instance');

describe('restart queue', () => {
    let instance;

    beforeEach(() => {
        return LusterInstance
            .run('../fixtures/restart_queue/master.js', false)
            .then(inst => instance = inst);
    });

    it('should restart workers one by one', () => {
        const expected = [
            'restarting',
            'exit 1',
            'run 1',
            'exit 2',
            'run 2',
            'exit 3',
            'run 3\n'
        ].join('\n');
        return instance.sendWaitAnswer('restart', 'restarted').then(() => {
            assert(instance.output().endsWith(expected), 'Output should end with ' + expected);
        });
    });

    it('should continue if restarted worker became dead', () => {
        const expected = [
            'restarting',
            'exit 1',
            'run 1',
            'dead 1',
            'exit 1',
            'exit 2',
            'run 2',
            'exit 3',
            'run 3\n'
        ].join('\n');
        return instance.sendWaitAnswer('restartKillFirst', 'restarted').then(() => {
            assert(instance.output().endsWith(expected), 'Output should end with ' + expected);
        });
    });

    it('should remove self-restarted worker from queue', () => {
        // Exit/run order of workers is not well-defined, so the only way is to compare sorted log lines
        const expected = [
            'restarting',
            'exit 1',
            'run 1',
            'exit 3',
            'run 3',
            'exit 2',
            'run 2',
            ''
        ].sort();
        return instance.sendWaitAnswer('restartKillThird', 'restarted').then(() => {
            const output = instance.output().split('\n').slice(-expected.length).sort().join('\n');
            assert.equal(output, expected.join('\n'));
        });
    });

    afterEach(() => {
        if (instance) {
            instance.kill();
            instance = null;
        }
    });
});
