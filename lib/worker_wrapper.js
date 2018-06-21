const cluster = require('cluster'),
    RPC = require('./rpc'),
    RPCCallback = require('./rpc-callback'),
    EventEmitterEx = require('./event_emitter_ex'),
    Port = require('./port'),
    LusterWorkerWrapperError = require('./errors').LusterWorkerWrapperError;

/**
 * Identifier for next constructed WorkerWrapper.
 * Usage restricted to WorkerWrapper constructor only.
 * @type {Number}
 * @private
 */
let nextId = 0;

/**
 * @class WorkerWrapperOptions
 * @property {Number|String} port Port number or socket path which worker can listen
 * @property {Boolean} [persistent=true] While `persistent === true` worker will be restarted on exit
 * @property {Number} [forkTimeout=false]
 *      Time (in ms) to wait from 'fork' event to 'online' before launch if failed.
 *      If evaluates to `false` then forkTimeout will not set.
 * @property {Number} [stopTimeout=false]
 *      Time (in ms) to wait from 'disconnect' event to 'exit' before `worker.kill` call
 *      If evaluates to `false` then stopTimeout will not set.
 * @property {Number} [exitThreshold=false]
 * @property {Number} [allowedSequentialDeaths=0]
 *      How many times worker can die in `exitThreshold` time before will be marked as dead.
 */
class WorkerWrapperOptions {
    constructor(options) {
        this.persistent = typeof options.persistent === 'undefined' ? true : options.persistent;
        this.forkTimeout = options.forkTimeout;
        this.stopTimeout = options.stopTimeout;
        this.exitThreshold = options.exitThreshold;
        this.allowedSequentialDeaths = options.allowedSequentialDeaths || 0;
        this.port = options.port;
    }

    get port() {
        return this._port;
    }

    /**
     * Setter of `this.options.port` affects value of the `isListeningUnixSocket` property.
     * @memberOf WorkerWrapperOptions
     * @property {Number|String} port
     * @public
     */
    set port(value) {
        if (!(value instanceof Port)) {
            value = new Port(value);
        }

        return this._port = value;
    }
}

/**
 * @event WorkerWrapper#state
 * @param {WorkerWrapperState} state Actual WorkerWrapper state
 * @see WorkerWrapper.STATES for possible `state` values.
 */

/**
 * @constructor
 * @class WorkerWrapper
 * @augments EventEmitterEx
 * @param {Master} master
 * @param {WorkerWrapperOptions} options
 *
 * # Worker wrapper state transitions
 *
 * WorkerWrapper has 'stopped' state by default (once created).
 * External events can
 */
class WorkerWrapper extends EventEmitterEx {
    constructor(master, options) {
        super();

        if (options &&
            typeof options.maxListeners !== 'undefined' &&
            options.maxListeners > this.getMaxListeners()) {
            this.setMaxListeners(options.maxListeners);
        }

        /**
         * WorkerWrapper state. Must be set via private method `WorkerWrapper#_setState(value)`,
         * not directly. Can be retrieved via `WorkerWrapper#state` getter.
         * @see WorkerWrapper.STATES for possible values.
         * @type WorkerWrapperState
         */
        this._state = WorkerWrapper.STATES.STOPPED;

        /**
         * @type WorkerWrapperOptions
         * @public
         * @readonly
         */
        this.options = new WorkerWrapperOptions(options);

        this._wid = ++nextId;

        /**
         * Indicates worker restarting in progress.
         * Changing `restarting` property value outside WorkerWrapper and it inheritors is not recommended.
         * @property {Boolean} restarting
         * @memberOf {WorkerWrapper}
         * @public
         */
        this.restarting = false;

        /**
         * Indicates worker stopping in progress.
         * Changing `stopping` property value outside WorkerWrapper and it inheritors is not recommended.
         * @property {Boolean} stopping
         * @memberOf {WorkerWrapper}
         * @public
         */
        this.stopping = false;

        /**
         * Worker can be marked as dead on sequential fails of launch attempt.
         * Dead worker will not be restarted on event WorkerWrapper#state('stopped').
         * Internally in the WorkerWrapper worker can be marked as dead, but never go alive again.
         * To revive the worker something outside of the WorkerWrapper
         * must set the `dead` property value to `false`.
         * @public
         * @type {Boolean}
         */
        this.dead = false;

        /**
         * Number of sequential deaths when worker life time was less than `exitThreshold` option value.
         * @type {Number}
         * @private
         */
        this._sequentialDeaths = 0;

        /**
         * Time of the last WorkerWrapper#state('running') event.
         * @type {Number}
         */
        this.startTime = null;

        /**
         * Indicates whether ready() method was called in worker
         * @public
         * @type {Boolean}
         */
        this.ready = false;

        /**
         * @type {Master}
         * @private
         */
        this._master = master;

        /**
         * Listen for cluster#fork and worker events.
         * @see WorkerWrapper#_proxyEvents to know about repeating worker events on WorkerWrapper instance.
         */
        cluster.on('fork', this._onFork.bind(this));
        this.on('online', this._onOnline.bind(this));
        this.on('disconnect', this._onDisconnect.bind(this));
        this.on('exit', this._onExit.bind(this));

        WorkerWrapper._RPC_EVENTS.forEach(event => {
            master.on('received worker ' + event, WorkerWrapper.createEventTranslator(event).bind(this));
        });
        this.on('ready', this._onReady.bind(this));
    }

    /**
     * @property {Number} wid Persistent WorkerWrapper identifier
     * @memberOf {WorkerWrapper}
     * @public
     * @readonly
     */
    get wid() {
        return this._wid;
    }

    /**
     * @property {Number} pid System process identifier
     * @memberOf {WorkerWrapper}
     * @public
     * @readonly
     */
    get pid() {
        return this.process.pid;
    }

    /**
     * Current WorkerWrapper instance state
     * @see WorkerWrapper.STATES for possible values.
     * @property {WorkerWrapperState} state
     * @memberOf {WorkerWrapper}
     * @public
     * @readonly
     */
    get state() {
        return this._state;
    }

    /**
     * @see WorkerWrapper.STATES for possible `state` argument values
     * @param {WorkerWrapperState} state
     * @private
     * @fires WorkerWrapper#state
     */
    _setState(state) {
        this._state = state;

        this['_onState' + state[0].toUpperCase() + state.slice(1)]();

        this.emit('state', state);
    }

    static createEventTranslator(event) {
        return /** @this {WorkerWrapper} */function(worker) {
            if (this._worker && worker.id === this._worker.id) {
                this.emit(event);
            }
        };
    }

    _onReady() {
        this.ready = true;
    }

    /**
     * @private
     */
    _onExit() {
        this.ready = false;
        this._setState(WorkerWrapper.STATES.STOPPED);
    }

    /**
     * event:_worker#disconnect handler
     * @private
     */
    _onDisconnect() {
        this.ready = false;
        this._setState(WorkerWrapper.STATES.STOPPING);
    }

    /**
     * @event WorkerWrapper#ready
     */

    /**
     * event:_worker#online handler
     * @fires WorkerWrapper#ready
     * @private
     */
    _onOnline() {
        this._setState(WorkerWrapper.STATES.RUNNING);

        // pass some of the {WorkerWrapper} properties to {Worker}
        this.remoteCall(RPC.fns.worker.applyForeignProperties, {
            pid: this.process.pid
        });
    }

    /**
     * event:cluster#fork handler
     * @private
     */
    _onFork(worker) {
        if (this._worker && worker.id === this._worker.id) {
            this.emit('fork');
            this._setState(WorkerWrapper.STATES.LAUNCHING);
        }
    }

    /**
     * event:state('launching') handler
     * @private
     */
    _onStateLaunching() {
        this.restarting = false;

        if (this.options.forkTimeout) {
            this.launchTimeout = setTimeout(() => {
                this.launchTimeout = null;

                if (this._worker !== null) {
                    this._worker.kill();
                }
            }, this.options.forkTimeout);
        }
    }

    /**
     * event:state('running') handler
     * @private
     */
    _onStateRunning() {
        if (this.launchTimeout) {
            clearTimeout(this.launchTimeout);
            this.launchTimeout = null;
        }

        this.startTime = Date.now();
    }

    /**
     * event:state('stopping') handler
     * @private
     */
    _onStateStopping() {
        this._scheduleForceStop();
    }

    /**
     * event:state('stopped') handler
     * @private
     */
    _onStateStopped() {
        this._cancelForceStop();

        // increase sequential deaths count if worker life time less
        // than `exitThreshold` option value (and option was passed to constructor).
        if (this.options.exitThreshold &&
            Date.now() - this.startTime < this.options.exitThreshold &&
            !this.restarting) {
            this._sequentialDeaths++;
        }

        // mark worker as dead if too much sequential deaths
        if (this._sequentialDeaths > this.options.allowedSequentialDeaths) {
            this.dead = true;
        }

        this._worker = null;

        // start worker again if it persistent or in the restarting state
        // and isn't marked as dead
        if (((this.options.persistent && !this.stopping) || this.restarting) && !this.dead) {
            setImmediate(this.run.bind(this));
        }

        this.stopping = false;
    }

    /**
     * @returns {Boolean}
     */
    isRunning() {
        return this.state === WorkerWrapper.STATES.LAUNCHING ||
            this.state === WorkerWrapper.STATES.RUNNING;
    }

    /**
     * @event WorkerWrapper#error
     * @param {LusterError} error
     */

    /**
     * Spawn a worker
     * @fires WorkerWrapper#error if worker already running
     * @fires WorkerWrapper#state('launching') on success
     * @returns {WorkerWrapper} self
     */
    run() {
        if (this.isRunning()) {
            this.emit('error',
                LusterWorkerWrapperError.createError(
                    LusterWorkerWrapperError.CODES.INVALID_ATTEMPT_TO_CHANGE_STATE,
                    {
                        wid: this.wid,
                        pid: this.process.pid,
                        state: this.state,
                        targetState: WorkerWrapper.STATES.LAUNCHING
                    }));

            return this;
        }

        setImmediate(() => {
            /** @private */
            this._worker = cluster.fork({
                port: this.options.port,
                LUSTER_WID: this.wid,
            });

            /** @private */
            this._remoteCall = RPC.createCaller(this._worker);

            this._proxyEvents();
        });

        return this;
    }

    /**
     * Disconnect worker to stop it.
     * @fires WorkerWrapper#error if worker status is 'stopped' or 'stopping'
     * @fires WorkerWrapper#status('stopping') on success
     * @returns {WorkerWrapper}
     */
    stop() {
        if (!this.isRunning()) {
            this.emit('error',
                LusterWorkerWrapperError.createError(
                    LusterWorkerWrapperError.CODES.INVALID_ATTEMPT_TO_CHANGE_STATE,
                    {
                        wid: this.wid,
                        pid: this.process.pid,
                        state: this.state,
                        targetState: WorkerWrapper.STATES.STOPPING
                    }));

            return this;
        }

        this.stopping = true;

        setImmediate(() => {
            // state can be changed before function call
            if (this.isRunning()) {
                this._worker.disconnect();
                this._scheduleForceStop();
            }
        });

        return this;
    }

    /**
     * Set WorkerWrapper#restarting to `true` and stop it,
     * which leads to worker restart.
     */
    restart() {
        this.restarting = true;
        this.stop();
    }

    /**
     * Call Worker method via RPC
     * @method
     * @param {String} name of called command in the worker
     * @param {...*} args
     */
    remoteCall(name, ...args) {
        if (this.isRunning()) {
            this._remoteCall(name, ...args);
        } else {
            this.emit('error',
                LusterWorkerWrapperError.createError(
                    LusterWorkerWrapperError.CODES.REMOTE_COMMAND_CALL_TO_STOPPED_WORKER,
                    {
                        wid: this.wid,
                        pid: this.process.pid,
                        command: name
                    }));
        }
    }

    // proxy some properties to WorkerWrapper#_worker

    get id() {
        return this._worker.id;
    }

    get process() {
        return this._worker.process;
    }

    get suicide() {
        return this._worker.suicide;
    }

    // proxy some methods to WorkerWrapper#_worker
    send(...args) {
        this._worker.send(...args);
    }

    disconnect() {
        this._worker.disconnect();
    }

    /**
     * repeat events from WorkerWrapper#_worker on WorkerWrapper
     * @private
     */
    _proxyEvents() {
        WorkerWrapper._PROXY_EVENTS
            .forEach(eventName => {
                this._worker.on(eventName, this.emit.bind(this, eventName));
            });
    }

    inspect() {
        return 'WW{ id:' + this.wid + ', state: ' + this.state + '}';
    }

    broadcastEvent(...args) {
        //TODO args here passed as single array, but remoteCall can handle multiple args
        this.remoteCall(RPC.fns.worker.broadcastMasterEvent, args);
    }

    /**
     * Do a remote call to worker, wait for worker to handle it, then execute registered callback
     * @method
     * @param {String} opts.command
     * @param {Function} opts.callback
     * @param {Number} [opts.timeout] in milliseconds
     * @param {*} [opts.data]
     * @public
     */
    remoteCallWithCallback(opts) {
        const callbackId = RPCCallback.setCallback(this, opts.command, opts.callback, opts.timeout);

        this.remoteCall(opts.command, opts.data, callbackId);
    }

    /**
     * Schedule a forceful worker stop using signal.
     * Only schedules timeout if it was not set yet.
     * @private
     */
    _scheduleForceStop() {
        // We could schedule force stop either when `stop` method is called or when `disconnected` event received from
        // worker. In most cases `stop` will be called and then `disconnected` event will fire, therefore we shall
        // make sure we do not re-run the force stop timer.
        if (this.options.stopTimeout && !this.stopTimeout) {
            this.stopTimeout = setTimeout(() => {
                this.stopTimeout = null;

                if (this._worker !== null) {
                    this._worker.process.kill();
                }
            }, this.options.stopTimeout);
        }
    }

    /**
     * Clears a forceful worker stop.
     * @private
     */
    _cancelForceStop() {
        if (this.stopTimeout) {
            clearTimeout(this.stopTimeout);
            this.stopTimeout = null;
        }
    }

    /**
     * Adds this worker to master's restart queue
     * @public
     */
    softRestart() {
        this._master.scheduleWorkerRestart(this);
    }
}

/**
 * Possible WorkerWrapper instance states.
 * @property {Object} STATES
 * @memberOf WorkerWrapper
 * @typedef WorkerWrapperState
 * @enum
 * @readonly
 * @public
 * @static
 */
Object.defineProperty(WorkerWrapper, 'STATES', {
    value: Object.freeze({
        STOPPED: 'stopped',
        LAUNCHING: 'launching',
        RUNNING: 'running',
        STOPPING: 'stopping'
    }),
    enumerable: true
});

/**
 * Events to repeat from WorkerWrapper#_worker on WorkerWrapper instance
 * @memberOf WorkerWrapper
 * @property {String[]} _PROXY_EVENTS
 * @static
 * @private
 */
Object.defineProperty(WorkerWrapper, '_PROXY_EVENTS', {
    value: Object.freeze([
        'message',
        'online',
        'listening',
        'disconnect',
        'exit'
    ]),
    enumerable: true
});

/**
 * Events received from workers via IPC
 * @memberOf WorkerWrapper
 * @property {String[]} _RPC_EVENTS
 * @static
 * @private
 */
Object.defineProperty(WorkerWrapper, '_RPC_EVENTS', {
    value: Object.freeze([
        'configured',
        'extension loaded',
        'initialized',
        'loaded',
        'ready'
    ]),
    enumerable: true
});

/**
 * All events which can be emitted by WorkerWrapper
 * @memberOf WorkerWrapper
 * @property {String[]} EVENTS
 * @static
 */
Object.defineProperty(WorkerWrapper, 'EVENTS', {
    value: Object.freeze(
        ['error', 'state', 'fork']
            .concat(WorkerWrapper._PROXY_EVENTS)
            .concat(WorkerWrapper._RPC_EVENTS)
    ),
    enumerable: true
});

module.exports = WorkerWrapper;
