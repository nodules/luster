var EventEmitterEx = require('./event_emitter_ex'),
    WorkerWrapper = require('./worker_wrapper'),
    RestartQueue;

/**
 * Restart queue became empty
 * @event RestartQueue#drain
 */

/**
 * Restart queue allows only one worker to be restarted at a time, waiting for its `ready` event or when worker becomes
 * dead.
 * If a worker is restarted outside the queue or becomes dead, it will be removed from the queue.
 * @constructor
 * @class RestartQueue
 * @augments EventEmitterEx
 */
RestartQueue = EventEmitterEx.create(function RestartQueue() {
    /**
     * @type {WorkerWrapper[]}
     * @private
     */
    this._queue = [];
});

/**
 * Adds new worker in restart queue. Does nothing if worker is already in queue.
 * @public
 * @param {WorkerWrapper} worker
 */
RestartQueue.prototype.push = function(worker) {
    if (this.has(worker)) {
        // Worker is already in queue, do nothing
        return;
    }

    var removeWorker = function() {
        worker.removeListener('ready', removeWorker);
        worker.removeListener('state', checkDead);
        this._remove(worker);
    }.bind(this);

    var checkDead = function(state) {
        if (state === WorkerWrapper.STATES.STOPPED && worker.dead) {
            removeWorker();
        }
    };

    worker.on('ready', removeWorker);
    worker.on('state', checkDead);
    this._queue.push(worker);
    this._process();
};

/**
 * Returns true if specified worker is in this queue.
 * @public
 * @param {WorkerWrapper} worker
 * @returns {Boolean}
 */
RestartQueue.prototype.has = function(worker) {
    return this._queue.indexOf(worker) !== -1;
};

/**
 * Removes specified worker from queue
 * @private
 * @param {WorkerWrapper} worker
 */
RestartQueue.prototype._remove = function(worker) {
    var idx = this._queue.indexOf(worker);
    this._queue.splice(idx, 1);
    this._process();
};

/**
 * Checks if any processing is needed. Should be called after each restart queue state change.
 * @private
 */
RestartQueue.prototype._process = function() {
    if (this._queue.length === 0) {
        this.emit('drain');
        return;
    }

    var head = this._queue[0];
    if (head.ready) {
        head.restart();
    }
};

module.exports = RestartQueue;
