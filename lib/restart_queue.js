const EventEmitterEx = require('./event_emitter_ex'),
    WorkerWrapper = require('./worker_wrapper');

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
class RestartQueue extends EventEmitterEx {
    constructor(eexKey = undefined) {
        super();

        /**
         * @type {WorkerWrapper[]}
         * @private
         */
        this._queue = [];

        this.eexKey = eexKey;
    }

    /**
     * Adds new worker in restart queue. Does nothing if worker is already in queue.
     * @public
     * @param {WorkerWrapper} worker
     */
    push(worker) {
        if (this.has(worker)) {
            // Worker is already in queue, do nothing
            return;
        }

        const removeWorker = () => {
            worker.removeListener('ready', removeWorker);
            worker.removeListener('state', checkDead);
            this._remove(worker);
        };

        const checkDead = state => {
            if (state === WorkerWrapper.STATES.STOPPED && worker.dead) {
                removeWorker();
            }
        };

        worker.on('ready', removeWorker);
        worker.on('state', checkDead);
        this._queue.push(worker);
        this._process();
    }

    /**
     * Returns true if specified worker is in this queue.
     * @public
     * @param {WorkerWrapper} worker
     * @returns {Boolean}
     */
    has(worker) {
        return this._queue.indexOf(worker) !== -1;
    }

    /**
     * Removes specified worker from queue
     * @private
     * @param {WorkerWrapper} worker
     */
    _remove(worker) {
        const idx = this._queue.indexOf(worker);
        this._queue.splice(idx, 1);
        this._process();
    }

    /**
     * Checks if any processing is needed. Should be called after each restart queue state change.
     * @private
     */
    _process() {
        if (this._queue.length === 0) {
            this.emit('drain');
            return;
        }

        const head = this._queue[0];
        if (head.ready) {
            head.restart();
        }
    }
}

module.exports = RestartQueue;
