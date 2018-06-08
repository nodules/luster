/* globals sinon,describe,it,beforeEach,afterEach */
'use strict';
const RestartQueue = require('../../../lib/restart_queue');

describe('RestartQueue', function() {
    let queue;
    const sandbox = sinon.sandbox.create();

    beforeEach(function() {
        queue = new RestartQueue();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('push', function() {
        it('should do nothing if object is present in queue', function() {
            const q = sandbox.mock(queue);
            q.expects('_process').once();
            const worker = {on: function() {}};
            queue.push(worker);
            queue.push(worker);
            q.verify();
        });
    });
});
