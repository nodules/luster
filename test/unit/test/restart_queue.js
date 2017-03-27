/* globals sinon,describe,it,beforeEach,afterEach */
'use strict';
var RestartQueue = require('../../../lib/restart_queue');

describe('RestartQueue', function() {
    var queue,
        sandbox = sinon.sandbox.create();

    beforeEach(function() {
        queue = new RestartQueue();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('push', function() {
        it('should do nothing if object is present in queue', function() {
            var q = sandbox.mock(queue);
            q.expects('_process').once();
            var worker = {on: function() {}};
            queue.push(worker);
            queue.push(worker);
            q.verify();
        });
    });
});
