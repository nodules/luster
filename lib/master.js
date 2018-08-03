const cluster = require('cluster');

const ClusterProcess = require('./cluster_process');
const LusterMasterError = require('./errors').LusterMasterError;
const RPC = require('./rpc');
const WorkerPool = require('./worker-pool');
const WorkerWrapper = require('./worker_wrapper');

const DEFAULT_POOL_KEY = '__default';

/**
 * @constructor
 * @class Master
 * @augments ClusterProcess
 */
class Master extends ClusterProcess {
    constructor() {
        super();

        /**
         * Configuration object to pass to cluster.setupMaster()
         * @type {Object}
         * @private
         */
        this._masterOpts = {};

        this.pools = new Map();
        this.createPool(DEFAULT_POOL_KEY);

        this.id = 0;
        this.wid = 0;
        this.eexKey = 0;
        this.pid = process.pid;

        // @todo make it optional?
        process.on('SIGINT', this._onSignalQuit.bind(this));
        process.on('SIGQUIT', this._onSignalQuit.bind(this));
    }

    createPool(key) {
        if (this.pools.has(key)) {
            throw LusterMasterError.createError(
                LusterMasterError.CODES.POOL_KEY_ALREADY_TAKEN,
                {key}
            );
        }

        this.emit('create pool', key);
        const pool = new WorkerPool(key, this);
        this._proxyWorkerEvents(pool);
        pool.on('shutdown', this._checkPoolsAlive.bind(this));
        this.pools.set(key, pool);
        return pool;
    }

    getPool(key) {
        return this.pools.get(key);
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
            .once('shutdown', () => process.exit(0))
            .shutdown();
    }

    /**
     * Check for alive workers, if no one here, then emit "shutdown".
     * @private
     */
    _checkPoolsAlive() {
        let dead = true;
        this.forEachPool(pool => dead = dead && pool.dead);

        if (dead) {
            this.emit('shutdown');
        }
    }

    /**
     * Repeat WorkerWrapper events from WorkerPool on Master
     * so for example 'online' became 'worker online'
     * @private
     * @param {WorkerPool} pool
     */
    _proxyWorkerEvents(pool) {
        for (const eventName of WorkerWrapper.EVENTS) {
            const proxyEventName = 'worker ' + eventName;
            pool.on(proxyEventName, this.emit.bind(this, proxyEventName));
        }
    }

    /**
     * @returns {number[]} workers ids array
     */
    getWorkersIds() {
        return this.getWorkersArray().map(w => w.wid);
    }

    /**
     * @returns {WorkerWrapper[]} workers array
     */
    getWorkersArray() {
        let result = [];
        this.forEachPool(
            pool => result = result.concat(pool.getWorkersArray())
        );
        return result;
    }

    forEachPool(fn) {
        for (const pool of this.pools.values()) {
            fn(pool);
        }
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
        this.forEachPool(pool => {
            pool.forEach(fn);
        });

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

        this.pools.get(DEFAULT_POOL_KEY).configure(this.config);
    }

    /**
     * @param {Number[]} wids Array of `WorkerWrapper#wid` values
     * @param {String} event wait for
     * @public
     * @returns {Promise<void>}
     */
    waitForWorkers(wids, event) {
        const promises = [];
        this.forEachPool(
            pool => promises.push(pool.waitForWorkers(wids, event))
        );

        return Promise.all(promises);
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
        this.forEachPool(pool => pool.restart());

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

    async _softRestart() {
        const promises = [];
        this.forEachPool(
            pool => promises.push(pool.softRestart())
        );

        await Promise.all(promises);
        this.emit('restarted');
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
        this._softRestart();
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
        this.forEachPool(pool => pool.remoteCallToAll(name, ...args));
    }

    /**
     * Broadcast event to all workers.
     * @method
     * @param {String} event of called command in the worker
     * @param {...*} args
     * @public
     */
    broadcastEventToAll(event, ...args) {
        this.forEachPool(pool => pool.broadcastEventToAll(event, ...args));
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
        this.forEachPool(pool => pool.emitToAll(event, ...args));
    }

    /**
     * @event Master#shutdown
     */

    async _shutdown() {
        const promises = [];
        this.forEachPool(
            pool => promises.push(pool._shutdown())
        );

        await Promise.all(promises);

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
        this.forEachPool(pool => pool.remoteCallToAllWithCallback(opts));
    }

    async _run() {
        await this.whenInitialized();

        cluster.setupMaster(this._masterOpts);

        // TODO maybe run this after starting waitForAllWorkers
        this.forEachPool(pool => pool.run());

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
