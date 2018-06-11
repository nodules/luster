/* globals sinon,describe,it,beforeEach,afterEach */
'use strict';
const RestartQueue = require('../../../lib/restart_queue');

describe('RestartQueue', () => {
    let queue;
    const sandbox = sinon.sandbox.create();

    beforeEach(() => queue = new RestartQueue());

    afterEach(() => {
        sandbox.restore();
    });

    describe('push', () => {
        it('should do nothing if object is present in queue', () => {
            const q = sandbox.mock(queue);
            q.expects('_process').once();
            const worker = {on: () => {}};
            queue.push(worker);
            queue.push(worker);
            q.verify();
        });
    });
});
