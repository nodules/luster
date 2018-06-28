'use strict';

const os = require('os');

const Configuration = require('./configuration');
const EventEmitterEx = require('./event_emitter_ex');
const Port = require('./port');
const RestartQueue = require('./restart_queue');
const WorkerWrapper = require('./worker_wrapper');

class WorkerPool extends EventEmitterEx {
    constructor(key, master) {
        super();

        this.key = key;
        this.eexKey = key;
        this.master = master;

        this.config = null;

        /**
         * @type {Object}
         * @property {WorkerWrapper} *
         * @public
         * @todo make it private or public immutable
         */
        this.workers = {};

        /**
         * Workers restart queue.
         * @type {RestartQueue}
         * @private
         */
        this._restartQueue = new RestartQueue(key);

        this._runningPromise = new Promise(resolve => {
            this.once('running', resolve);
        });

        this.dead = false;

        this.on('worker state', this._cleanupUnixSockets.bind(this));
        this._checkWorkersAlive = this._checkWorkersAlive.bind(this);
        this.on('worker exit', this._checkWorkersAlive);
    }

    /**
     * Remove not used unix socket before worker will try to listen it.
     * @param {WorkerWrapper} worker
     * @param {WorkerWrapperState} state
     * @private
     */
    _cleanupUnixSockets(worker, state) {
        const port = worker.options.port;

        if (this._restartQueue.has(worker) ||
            state !== WorkerWrapper.STATES.LAUNCHING ||
            port.family !== Port.UNIX) {
            return;
        }

        const inUse = this.getWorkersArray().some(w =>
            worker.wid !== w.wid &&
            w.isRunning() &&
            port.isEqualTo(w.options.port)
        );

        if (!inUse) {
            port.unlink(err => {
                if (err) {
                    this.emit('error', err);
                }
            });
        }
    }

    /**
     * Check for alive workers, if no one here, then emit "shutdown".
     * @private
     */
    _checkWorkersAlive() {
        const dead = this
            .getWorkersArray()
            .every(w => w.dead);

        if (dead) {
            this.dead = true;
            this.emit('shutdown');
        }
    }

    /**
     * @returns {number[]} workers ids array
     */
    getWorkersIds() {
        if (!this._workersIdsCache) {
            this._workersIdsCache = this.getWorkersArray().map(w => w.wid);
        }

        return this._workersIdsCache;
    }

    /**
     * @returns {WorkerWrapper[]} workers array
     */
    getWorkersArray() {
        if (!this._workersArrayCache) {
            this._workersArrayCache = Object.values(this.workers);
        }

        return this._workersArrayCache;
    }

    /**
     * Add worker to the pool
     * @param {WorkerWrapper} worker
     * @returns {WorkerPool} self
     * @public
     */
    add(worker) {
        // invalidate WorkerPool#getWorkersIds and WorkerPool#getWorkersArray cache
        this._workersIdsCache = null;
        this._workersArrayCache = null;

        this.workers[worker.wid] = worker;
        this._proxyWorkerEvents(worker);

        return this;
    }

    /**
     * Iterate over workers in the pool.
     * @param {Function} fn
     * @public
     * @returns {WorkerPool} self
     *
     * @description Shortcut for:
     *      pool.getWorkersArray().forEach(fn);
     */
    forEach(fn) {
        this.getWorkersArray()
            .forEach(fn);

        return this;
    }

    /**
     * Repeat WorkerWrapper events on WorkerPool and add 'worker ' prefix to event names
     * so for example 'online' became 'worker online'
     * @private
     * @param {WorkerWrapper} worker
     */
    _proxyWorkerEvents(worker) {
        WorkerWrapper.EVENTS
            .forEach(eventName => {
                const proxyEventName = 'worker ' + eventName;
                worker.on(eventName, this.emit.bind(this, proxyEventName, worker));
            });
    }

    configure(config) {
        this.config = new Configuration(config);

        const // WorkerWrapper options
            forkTimeout = this.config.get('control.forkTimeout'),
            stopTimeout = this.config.get('control.stopTimeout'),
            exitThreshold = this.config.get('control.exitThreshold'),
            allowedSequentialDeaths = this.config.get('control.allowedSequentialDeaths'),

            count = this.config.get('workers', os.cpus().length),
            isServerPortSet = this.config.has('server.port'),
            groups = this.config.get('server.groups', 1),
            workersPerGroup = Math.floor(count / groups);

        const workerEnv = this.config.get('workerEnv');

        let port,
            // workers and groups count
            i = 0,
            group = 0,
            workersInGroup = 0;

        if (isServerPortSet) {
            port = new Port(this.config.get('server.port'));
        }

        // create pool of workers
        while (count > i++) {
            this.add(new WorkerWrapper(this, {
                forkTimeout,
                stopTimeout,
                exitThreshold,
                allowedSequentialDeaths,
                port: isServerPortSet ? port.next(group) : 0,
                maxListeners: this.getMaxListeners(),
                workerEnv
            }));

            // groups > 1, current group is full and
            // last workers can form at least more one group
            if (groups > 1 &&
                ++workersInGroup >= workersPerGroup &&
                count - (group + 1) * workersPerGroup >= workersPerGroup) {
                workersInGroup = 0;
                group++;
            }
        }

        return this;
    }

    /**
     * @param {Number[]} wids Array of `WorkerWrapper#wid` values
     * @param {String} event wait for
     * @public
     * @returns {Promise<void>}
     */
    waitForWorkers(wids, event) {
        const pendingWids = new Set(wids);

        return new Promise(resolve => {
            if (pendingWids.size === 0) {
                resolve();
            }

            const onWorkerState = worker => {
                const wid = worker.wid;
                if (pendingWids.has(wid)) {
                    pendingWids.delete(wid);
                }
                if (pendingWids.size === 0) {
                    this.removeListener(event, onWorkerState);
                    resolve();
                }
            };
            this.on(event, onWorkerState);
        });
    }

    /**
     * @param {String} event wait for
     * @public
     * @returns {Promise<void>}
     */
    waitForAllWorkers(event) {
        return this.waitForWorkers(
            this.getWorkersIds(),
            event
        );
    }

    /**
     * @event WorkerPool#running
     */

    async _run() {
        // TODO maybe run this after starting waitForAllWorkers
        this.forEach(worker => worker.run());

        await this.waitForAllWorkers('worker ready');

        this.emit('running');
    }

    /**
     * Resolves when all workers ready on first run.
     * @this {ClusterProcess}
     * @returns {Promise<void>}
     */
    onceFirstRunning() {
        return this._runningPromise;
    }

    /**
     * Fork workers.
     * Execution will be delayed until WorkerPool became configured
     * (`configured` event fired).
     * @method
     * @returns {WorkerPool} self
     * @public
     * @fires WorkerPool#running then workers spawned and ready.
     *
     * TODO : fix example
     * @example
     *      // file: master.js
     *      var master = require('luster');
     *
     *      master
     *          .configure({ app : 'worker' })
     *          .run();
     *
     *      // there is master is still not running anyway
     *      // it will run immediate once configured and
     *      // current thread execution done
     */
    run() {
        this._run();
        return this;
    }

    /**
     * @event WorkerPool#restarted
     */

    async _restart() {
        // TODO maybe run this after starting waitForAllWorkers
        this.forEach(worker => worker.restart());

        await this.waitForAllWorkers('worker ready');

        this.emit('restarted');
    }

    /**
     * Hard workers restart: all workers will be restarted at same time.
     * CAUTION: if dead worker is restarted, it will emit 'error' event.
     * @public
     * @returns {WorkerPool} self
     * @fires WorkerPool#restarted when workers spawned and ready.
     */
    restart() {
        this._restart();
        return this;
    }

    /**
     * Workers will be restarted one by one using RestartQueue.
     * If a worker becomes dead, it will be just removed from restart queue. However, if already dead worker is pushed
     * into the queue, it will emit 'error' on restart.
     * @public
     * @returns {WorkerPool} self
     * @fires WorkerPool#restarted when workers spawned and ready.
     */
    softRestart() {
        return new Promise(resolve => {
            this.forEach(worker => worker.softRestart());
            this._restartQueue.once('drain', () => {
                this.emit('restarted');
                resolve();
            });
        });
    }

    /**
     * Schedules one worker restart using RestartQueue.
     * If a worker becomes dead, it will be just removed from restart queue. However, if already dead worker is pushed
     * into the queue, it will emit 'error' on restart.
     * @public
     * @param {WorkerWrapper} worker
     * @returns {WorkerPool} self
     */
    scheduleWorkerRestart(worker) {
        this._restartQueue.push(worker);
        return this;
    }

    /**
     * RPC to all workers
     * @method
     * @param {String} name of called command in the worker
     * @param {...*} args
     * @public
     */
    remoteCallToAll(name, ...args) {
        this.forEach(worker => {
            if (worker.ready) {
                worker.remoteCall(name, ...args);
            } else {
                worker.on('ready', () => {
                    worker.remoteCall(name, ...args);
                });
            }
        });
    }

    /**
     * Broadcast event to all workers.
     * @method
     * @param {String} event of called command in the worker
     * @param {...*} args
     * @public
     */
    broadcastEventToAll(event, ...args) {
        this.forEach(worker => {
            if (worker.ready) {
                worker.broadcastEvent(event, ...args);
            }
        });
    }

    /**
     * Emit event on pool and all workers in "ready" state.
     * @method
     * @param {String} event of called command in the worker
     * @param {...*} args
     * @public
     */
    emitToAll(event, ...args) {
        this.emit(event, ...args);
        this.broadcastEventToAll(event, ...args);
    }

    /**
     * @event WorkerPool#shutdown
     */

    async _shutdown() {
        const stoppedWorkers = [];

        this.forEach(worker => {
            if (worker.isRunning()) {
                worker.stop();
                stoppedWorkers.push(worker.wid);
            }
        });

        await this.waitForWorkers(
            stoppedWorkers,
            'worker exit',
        );

        this.emit('shutdown');
    }

    /**
     * Stop all workers and emit `WorkerPool#shutdown` event after successful shutdown of all workers.
     * @fires WorkerPool#shutdown
     * @returns {WorkerPool}
     */
    shutdown() {
        this.removeListener('worker exit', this._checkWorkersAlive);
        this._shutdown();
        return this;
    }

    /**
     * Do a remote call to all workers, callbacks are registered and then executed separately for each worker
     * @method
     * @param {String} opts.command
     * @param {Function} opts.callback
     * @param {Number} [opts.timeout] in milliseconds
     * @param {*} [opts.data]
     * @public
     */
    remoteCallToAllWithCallback(opts) {
        this.forEach(worker => {
            if (worker.isRunning()) {
                worker.remoteCallWithCallback(opts);
            }
        });
    }
}

module.exports = WorkerPool;
