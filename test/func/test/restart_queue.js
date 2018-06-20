/* globals describe,it,before,after,assert */
'use strict';

const LusterInstance = require('../helpers/luster_instance');

describe('restart queue', () => {
    let instance;

    beforeEach(async () => {
        instance = await LusterInstance
            .run('../fixtures/restart_queue/master.js', false);
    });

    it('should restart workers one by one', async () => {
        const expected = [
            'restarting',
            'exit 1',
            'run 1',
            'exit 2',
            'run 2',
            'exit 3',
            'run 3\n'
        ].join('\n');

        await instance.sendWaitAnswer('restart', 'restarted');

        assert(instance.output().endsWith(expected), 'Output should end with ' + expected);
    });

    it('should continue if restarted worker became dead', async () => {
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

        await instance.sendWaitAnswer('restartKillFirst', 'restarted');

        assert(instance.output().endsWith(expected), 'Output should end with ' + expected);
    });

    it('should remove self-restarted worker from queue', async () => {
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

        await instance.sendWaitAnswer('restartKillThird', 'restarted');

        const output = instance.output().split('\n').slice(-expected.length).sort().join('\n');
        assert.equal(output, expected.join('\n'));
    });

    afterEach(() => {
        if (instance) {
            instance.kill();
            instance = null;
        }
    });
});
