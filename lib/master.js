const os = require('os'),
    cluster = require('cluster'),
    ClusterProcess = require('./cluster_process'),
    WorkerWrapper = require('./worker_wrapper'),
    Port = require('./port'),
    RestartQueue = require('./restart_queue'),
    RPC = require('./rpc');

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
     * An instance of Master will call it, when running.
     * @param {Object} opts
     * @see {@link https://nodejs.org/api/cluster.html#clustersetupmastersettings}
     */
    setup(opts) {
        cluster.setupMaster({ ...cluster.settings, ...opts });
    }

    /**
     * SIGINT and SIGQUIT handler
     * @private
     */
    _onSignalQuit() {
        this
            .once('shutdown', () => process.exit(0))
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
        const workers = this.getWorkersArray(),
            alive = workers.reduce(
                (count, w) => w.dead ? count - 1 : count,
                workers.length
            );

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
            .forEach(eventName => {
                const proxyEventName = 'worker ' + eventName;
                worker.on(eventName, this.emit.bind(this, proxyEventName, worker));
            });
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
     * @returns {Master} self
     * @public
     */
    add(worker) {
        // invalidate Master#getWorkersIds and Master#getWorkersArray cache
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
     * @returns {Master} self
     *
     * @description Shortcut for:
     *      master.getWorkersArray().forEach(fn);
     */
    forEach(fn) {
        this.getWorkersArray()
            .forEach(fn);

        return this;
    }

    /**
     * Broadcast an event received by IPC from worker as 'worker <event>'.
     * @param {WorkerWrapper} worker
     * @param {String} event
     * @param {...*} args
     */
    broadcastWorkerEvent(worker, event, ...args) {
        this.emit('received worker ' + event, worker, ...args);
    }

    /**
     * Configure cluster
     * @override ClusterProcess
     * @private
     */
    _onConfigured() {
        super._onConfigured();

        // register global remote command in the context of master to receive events from master
        if (!this.hasRegisteredRemoteCommand(RPC.fns.master.broadcastWorkerEvent)) {
            this.registerRemoteCommand(
                RPC.fns.master.broadcastWorkerEvent,
                this.broadcastWorkerEvent.bind(this)
            );
        }

        const // WorkerWrapper options
            forkTimeout = this.config.get('control.forkTimeout'),
            stopTimeout = this.config.get('control.stopTimeout'),
            killTimeout = this.config.get('control.killTimeout'),
            exitThreshold = this.config.get('control.exitThreshold'),
            allowedSequentialDeaths = this.config.get('control.allowedSequentialDeaths'),

            count = this.config.get('workers', os.cpus().length),
            isServerPortSet = this.config.has('server.port'),
            groups = this.config.get('server.groups', 1),
            portsPerGroup = this.config.get('server.portsPerGroup', 1),
            masterInspectPort = this.config.get('properties.masterInspectPort'),
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
                forkTimeout,
                stopTimeout,
                killTimeout,
                exitThreshold,
                allowedSequentialDeaths,
                port: isServerPortSet ? port.next(group * portsPerGroup) : 0,
                masterInspectPort,
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
                pendingWids.delete(wid);
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
     * @event Master#running
     */

    /**
     * @event Master#restarted
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
     * @returns {Master} self
     * @fires Master#restarted when workers spawned and ready.
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
     * @returns {Master} self
     * @fires Master#restarted when workers spawned and ready.
     */
    softRestart() {
        this.forEach(worker => worker.softRestart());
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
     * Emit event on master and all workers in "ready" state.
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
     * @event Master#shutdown
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
     * Stop all workers and emit `Master#shutdown` event after successful shutdown of all workers.
     * @fires Master#shutdown
     * @returns {Master}
     */
    shutdown() {
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

    async _run() {
        await this.whenInitialized();

        // TODO maybe run this after starting waitForAllWorkers
        this.forEach(worker => worker.run());

        await this.waitForAllWorkers('worker ready');

        this.emit('running');
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
    run() {
        this._run();
        return this;
    }
}

module.exports = Master;
