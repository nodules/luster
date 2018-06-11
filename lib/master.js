const os = require('os'),
    cluster = require('cluster'),
    ClusterProcess = require('./cluster_process'),
    WorkerWrapper = require('./worker_wrapper'),
    Port = require('./port'),
    RestartQueue = require('./restart_queue');

/**
 * @constructor
 * @class Master
 * @augments ClusterProcess
 */
class Master extends ClusterProcess {
    constructor() {
        super();

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
        this._restartQueue = new RestartQueue();

        /**
         * Configuration object to pass to cluster.setupMaster()
         * @type {Object}
         * @private
         */
        this._masterOpts = {};

        this.id = 0;
        this.wid = 0;
        this.pid = process.pid;

        this.on('worker state', this._cleanupUnixSockets.bind(this));
        this.on('worker exit', this._checkWorkersAlive.bind(this));

        // @todo make it optional?
        process.on('SIGINT', this._onSignalQuit.bind(this));
        process.on('SIGQUIT', this._onSignalQuit.bind(this));
    }

    /**
     * Allows same object structure as cluster.setupMaster().
     * This function must be used instead of cluster.setupMaster(),
     * because all calls of cluster.setupMaster() ignored, except first one.
     * An instance of Master will call it, when running.
     * @param {Object} opts
     * @see {@link http://nodejs.org/api/cluster.html#cluster_cluster_setupmaster_settings}
     */
    setup(opts) {
        Object.assign(this._masterOpts, opts);
    }

    /**
     * SIGINT and SIGQUIT handler
     * @private
     */
    _onSignalQuit() {
        this
            .once('shutdown', function() {
                process.exit(0);
            })
            .shutdown();
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

        const self = this,
            inUse = this.getWorkersArray().some(function(w) {
                return worker.wid !== w.wid &&
                    w.isRunning() &&
                    port.isEqualTo(w.options.port);
            });

        if (!inUse) {
            port.unlink(function(err) {
                if (err) {
                    self.emit('error', err);
                }
            });
        }
    }

    /**
     * Check for alive workers, if no one here, then emit "shutdown".
     * @private
     */
    _checkWorkersAlive() {
        const workers = this.getWorkersArray(),
            alive = workers.reduce(function(count, w) {
                return w.dead ? count - 1 : count;
            }, workers.length);

        if (alive === 0) {
            this.emit('shutdown');
        }
    }

    /**
     * Repeat WorkerWrapper events on Master and add 'worker ' prefix to event names
     * so for example 'online' became 'worker online'
     * @private
     * @param {WorkerWrapper} worker
     */
    _proxyWorkerEvents(worker) {
        WorkerWrapper.EVENTS
            .forEach(function(eventName) {
                worker.on(eventName, this.emit.bind(this, 'worker ' + eventName, worker));
            }, this);
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
     * @returns {Master} self
     * @public
     */
    add(worker) {
        // invalidate Master#getWorkersArray cache
        this._workersArrayCache = null;

        this.workers[worker.wid] = worker;
        this._proxyWorkerEvents(worker);

        return this;
    }

    /**
     * Iterate over workers in the pool.
     * @param {Function} fn
     * @public
     * @returns {Master} self
     *
     * @description Shortcut for:
     *      master.getWorkersArray().forEach(function(worker) {
     *          // fn
     *      }, master);
     */
    forEach(fn) {
        this.getWorkersArray().forEach(function(worker) {
            fn.call(this, worker);
        }, this);

        return this;
    }

    /**
     * Configure cluster
     * @override ClusterProcess
     * @private
     */
    _onConfigured() {
        super._onConfigured.apply(this, arguments);

        const // WorkerWrapper options
            forkTimeout = this.config.get('control.forkTimeout'),
            stopTimeout = this.config.get('control.stopTimeout'),
            exitThreshold = this.config.get('control.exitThreshold'),
            allowedSequentialDeaths = this.config.get('control.allowedSequentialDeaths'),

            count = this.config.get('workers', os.cpus().length),
            isServerPortSet = this.config.has('server.port'),
            groups = this.config.get('server.groups', 1),
            workersPerGroup = Math.floor(count / groups);

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
                forkTimeout: forkTimeout,
                stopTimeout: stopTimeout,
                exitThreshold: exitThreshold,
                allowedSequentialDeaths: allowedSequentialDeaths,
                port: isServerPortSet ? port.next(group) : 0,
                maxListeners: this.getMaxListeners(),
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
    }

    /**
     * @param {Number[]} wids Array of `WorkerWrapper#wid` values
     * @param {String} event wait for
     * @param {Function} callback
     * @public
     * @returns {Master} self
     */
    waitForWorkers(wids, event, callback) {
        const self = this;
        const pendingWids = new Set(wids);

        function onWorkerState(worker) {
            const wid = worker.wid;
            if (pendingWids.has(wid)) {
                pendingWids.delete(wid);
            }
            if (pendingWids.size === 0) {
                self.removeListener(event, onWorkerState);
                callback.call(self);
            }
        }

        if (wids.length > 0) {
            this.on(event, onWorkerState);
        } else {
            setImmediate(callback.bind(self));
        }

        return this;
    }

    /**
     * @event Master#running
     */

    /**
     * @event Master#restarted
     */

    /**
     * Hard workers restart: all workers will be restarted at same time.
     * CAUTION: if dead worker is restarted, it will emit 'error' event.
     * @public
     * @returns {Master} self
     * @fires Master#restarted when workers spawned and ready.
     */
    restart() {
        this.waitForWorkers(
            this.getWorkersArray().map(function(worker) {
                worker.restart();

                return worker.wid;
            }),
            'worker ready',
            function() {
                this.emit('restarted');
            });

        return this;
    }

    /**
     * Workers will be restarted one by one using RestartQueue.
     * If a worker becomes dead, it will be just removed from restart queue. However, if already dead worker is pushed
     * into the queue, it will emit 'error' on restart.
     * @public
     * @returns {Master} self
     * @fires Master#restarted when workers spawned and ready.
     */
    softRestart() {
        this.forEach(function(worker) {
            worker.softRestart();
        });
        this._restartQueue.once('drain', this.emit.bind(this, 'restarted'));
        return this;
    }

    /**
     * Schedules one worker restart using RestartQueue.
     * If a worker becomes dead, it will be just removed from restart queue. However, if already dead worker is pushed
     * into the queue, it will emit 'error' on restart.
     * @public
     * @param {WorkerWrapper} worker
     * @returns {Master} self
     */
    scheduleWorkerRestart(worker) {
        this._restartQueue.push(worker);
        return this;
    }

    /**
     * @override
     * @see ClusterProcess
     * @private
     */
    _setupIPCMessagesHandler() {
        this.on('worker message', this._onMessage.bind(this));
    }

    /**
     * RPC to all workers
     * @method
     * @param {String} name of called command in the worker
     * @param {*} ...args
     * @public
     */
    remoteCallToAll(name) { // eslint-disable-line no-unused-vars
        const args = Array.prototype.slice.call(arguments, 0);

        this.forEach(function(worker) {
            if (worker.ready) {
                worker.remoteCall.apply(worker, args);
            } else {
                worker.on('ready', function() {
                    worker.remoteCall.apply(worker, args);
                }.bind(worker, args));
            }
        });
    }

    /**
     * Broadcast event to all workers.
     * @method
     * @param {String} event of called command in the worker
     * @param {*} ...args
     * @public
     */
    broadcastEventToAll() {
        const args = Array.prototype.slice.call(arguments, 0);
        this.forEach(function(worker) {
            if (worker.ready) {
                worker.broadcastEvent.apply(worker, args);
            }
        });
    }

    /**
     * Emit event on master and all workers in "ready" state.
     * @method
     * @param {String} event of called command in the worker
     * @param {*} ...args
     * @public
     */
    emitToAll() {
        this.emit.apply(this, arguments);
        this.broadcastEventToAll.apply(this, arguments);
    }

    /**
     * @event Master#shutdown
     */

    /**
     * Stop all workers and emit `Master#shutdown` event after successful shutdown of all workers.
     * @fires Master#shutdown
     * @returns {Master}
     */
    shutdown() {
        const stoppedWorkers = [];

        this.forEach(function(worker) {
            if (worker.isRunning()) {
                worker.stop();
                stoppedWorkers.push(worker.wid);
            }
        });

        this.waitForWorkers(
            stoppedWorkers,
            'worker exit',
            function() {
                this.emit('shutdown');
            });

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
        this.forEach(function(worker) {
            if (worker.isRunning()) {
                worker.remoteCallWithCallback(opts);
            }
        });
    }
}

/**
 * Fork workers.
 * Execution will be delayed until Master became configured
 * (`configured` event fired).
 * @method
 * @returns {Master} self
 * @public
 * @fires Master#running then workers spawned and ready.
 *
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
Master.prototype.run = Master.whenInitialized(function() {
    cluster.setupMaster(this._masterOpts);

    this.waitForWorkers(
        this.getWorkersArray().map(function(worker) {
            worker.run();

            return worker.wid;
        }),
        'worker ready',
        function() {
            this.emit('running');
        });

    return this;
});

module.exports = Master;
