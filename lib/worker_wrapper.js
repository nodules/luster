var cluster = require('cluster'),
    timers = require('timers'),
    RPC = require('./rpc'),
    EventEmitterEx = require('./event_emitter_ex'),
    Port = require('./port'),
    LusterWorkerWrapperError = require('./errors').LusterWorkerWrapperError,
    WorkerWrapper,

    /**
     * Identifier for next constructed WorkerWrapper.
     * Usage restricted to WorkerWrapper constructor only.
     * @type {Number}
     * @private
     */
    nextId = 0;

/**
 * @event WorkerWrapper#state
 * @param {WorkerWrapperState} state Actual WorkerWrapper state
 * @see WorkerWrapper.STATES for possible `state` values.
 */

/**
 * @memberOf WorkerWrapper
 * @typedef WorkerWrapperOptions
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
 * @property {Number} [debugPort=0]
 */

/**
 * @constructor
 * @class WorkerWrapper
 * @augments EventEmitterEx
 * @param {WorkerWrapperOptions} options
 *
 * # Worker wrapper state transitions
 *
 * WorkerWrapper has 'stopped' state by default (once created).
 * External events can
 */
WorkerWrapper = EventEmitterEx.create(function WorkerWrapper(options) {
    WorkerWrapper.__super.apply(this, arguments);

    if (options &&
        typeof options._maxListeners !== 'undefined' &&
        options._maxListeners > this._maxListeners) {
        this.setMaxListeners(options._maxListeners);
    }

    var /**
         * WorkerWrapper state. Must be set via private method `WorkerWrapper#_setState(value)`,
         * not directly. Can be retrieved via `WorkerWrapper#state` getter.
         * @see WorkerWrapper.STATES for possible values.
         * @type WorkerWrapperState
         */
        _state = WorkerWrapper.STATES.STOPPED,

        /** @type {Number|String} */
        _port;

    /**
     * @type WorkerWrapperOptions
     * @public
     * @readonly
     */
    this.options = {
        persistent : typeof options.persistent === 'undefined' ? true : options.persistent,
        forkTimeout : options.forkTimeout,
        stopTimeout : options.stopTimeout,
        exitThreshold : options.exitThreshold,
        allowedSequentialDeaths : options.allowedSequentialDeaths || 0
    };

    /**
     * Valid debug port number or `false`.
     * @memberOf WorkerWrapper#options
     * @property {Number|Boolean} debugPort
     * @readonly
     * @public
     */
    Object.defineProperty(this.options, 'debugPort', {
        value : typeof options.debugPort === 'number' ? options.debugPort : false
    });

    /**
     * Setter of `this.options.port` affects value of the `isListeningUnixSocket` property.
     * @memberOf WorkerWrapper#options
     * @property {Number|String} port
     * @public
     */
    Object.defineProperty(this.options, 'port', {
        get : function() {
            return _port;
        },
        set : function(value) {
            if ( ! value instanceof Port) {
                value = new Port(value);
            }

            /* jshint boss:true */
            return _port = value;
        },
        enumerable : true
    });

    this.options.port = options.port;

    /**
     * @property {Number} wid Persistent WorkerWrapper identifier
     * @memberOf {WorkerWrapper}
     * @public
     * @readonly
     */
    Object.defineProperty(this, 'wid', {
        value : ++nextId,
        enumerable : true
    });

    /**
     * Current WorkerWrapper instance state
     * @see WorkerWrapper.STATES for possible values.
     * @property {WorkerWrapperState} state
     * @memberOf {WorkerWrapper}
     * @public
     * @readonly
     */
    Object.defineProperty(this, 'state', {
        get : function() {
            return _state;
        },
        enumerable : true
    });

    /**
     * @see WorkerWrapper.STATES for possible `state` argument values
     * @param {WorkerWrapperState} state
     * @private
     * @fires WorkerWrapper#state
     */
    this._setState = function(state) {
        _state = state;

        this['_onState' + state[0].toUpperCase() + state.slice(1)]();

        this.emit('state', state);
    };

    /**
     * Indicates worker restarting in progress.
     * Changing `restarting` property value outside WorkerWrapper and it inheritors is not recommended.
     * @property {Boolean} restarting
     * @memberOf {WorkerWrapper}
     * @public
     */
    this.restarting = false;

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
     * Number of sequential death when worker life time was less than `exitThreshold` option value.
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
     * Listen for cluster#fork and worker events.
     * @see WorkerWrapper#_proxyEvents to know about repeating worker events on WorkerWrapper instance.
     */
    cluster.on('fork', this._onFork.bind(this));
    this.on('online', this._onOnline.bind(this));
    this.on('listening', this._onListening.bind(this));
    this.on('disconnect', this._onDisconnect.bind(this));
    this.on('exit', this._onExit.bind(this));
});

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
    value : Object.freeze({
        STOPPED : 'stopped',
        LAUNCHING : 'launching',
        RUNNING : 'running',
        STOPPING : 'stopping'
    }),
    enumerable : true
});

/**
 * @private
 * @param {Number} code Exit code
 * @param {String} [signal] Signal received by worker which leads to suicide
 */
WorkerWrapper.prototype._onExit = function(code, signal) {
    /*jshint unused:false*/
    this._setState(WorkerWrapper.STATES.STOPPED);
};

/**
 * event:_worker#disconnect handler
 * @private
 */
WorkerWrapper.prototype._onDisconnect = function() {
    this._setState(WorkerWrapper.STATES.STOPPING);
};

/**
 * @event WorkerWrapper#ready
 */

/**
 * event:_worker#online handler
 * @fires WorkerWrapper#ready
 * @private
 */
WorkerWrapper.prototype._onOnline = function() {
    this._setState(WorkerWrapper.STATES.RUNNING);

    // pass some of the {WorkerWrapper} properties to {Worker}
    // @todo: kaero: move RPC functions names to dictionary in the shared file
    this.remoteCall('core.worker.applyForeignProperties', {
            wid : this.wid
        });

    if (typeof this.options.port === 'undefined') {
        this.emit('ready');
    }
};

/**
 * event:_worker#listening handler
 * @fires WorkerWrapper#ready
 * @private
 */
WorkerWrapper.prototype._onListening = function() {
    if (typeof this.options.port !== 'undefined') {
        this.emit('ready');
    }
};

/**
 * event:cluster#fork handler
 * @private
 */
WorkerWrapper.prototype._onFork = function(worker) {
    if (this._worker && worker.id === this._worker.id) {
        this.emit('fork');
        this._setState(WorkerWrapper.STATES.LAUNCHING);
    }
};

/**
 * event:state('launching') handler
 * @private
 */
WorkerWrapper.prototype._onStateLaunching = function() {
    var self = this;

    this.restarting = false;

    if (this.options.forkTimeout) {
        this.launchTimeout = setTimeout(function() {
            self.launchTimeout = null;

            if (self._worker !== null) {
                self._worker.kill();
            }
        }, this.options.forkTimeout);
    }
};

/**
 * event:state('running') handler
 * @private
 */
WorkerWrapper.prototype._onStateRunning = function() {
    if (this.launchTimeout) {
        clearTimeout(this.launchTimeout);
        this.launchTimeout = null;
    }

    this.startTime = Date.now();
};

/**
 * event:state('stopping') handler
 * @private
 */
WorkerWrapper.prototype._onStateStopping = function() {
    var self = this;

    if (this.options.stopTimeout) {
        this.stopTimeout = setTimeout(function() {
            self.stopTimeout = null;

            if (self._worker !== null) {
                self._worker.kill();
            }
        }, this.options.stopTimeout);
    }
};

/**
 * event:state('stopped') handler
 * @private
 */
WorkerWrapper.prototype._onStateStopped = function() {
    var self = this;

    // clear stopTimeout
    if (this.stopTimeout) {
        clearTimeout(this.stopTimeout);
        this.stopTimeout = null;
    }

    // increase sequential deaths count if worker life time less
    // than `exitThreshold` option value (and option was passed to constructor).
    if (this.options.exitThreshold &&
        Date.now() - this.startTime < this.options.exitThreshold) {
        this._sequentialDeaths++;
    }

    // mark worker as dead if too much sequential deaths
    if (this._sequentialDeaths >= this.options.allowedSequentialDeaths) {
        this.dead = true;
    }

    this._worker = null;

    // start worker again if it persistent or in the restarting state
    // and isn't marked as dead
    if (this.options.persistent || this.restarting && ! this.dead) {

        var fn = function() {
            self.run();
        };

        //hack for node v < 0.9.1
        timers.setImmediate ? setImmediate(fn) : process.nextTick(fn);
    }
};

/**
 * Events to repeat from WorkerWrapper#_worker on WorkerWrapper instance
 * @memberOf WorkerWrapper
 * @property {String[]} _PROXY_EVENTS
 * @static
 * @private
 */
Object.defineProperty(WorkerWrapper, '_PROXY_EVENTS', {
    value : Object.freeze([ 'message', 'online', 'listening', 'disconnect', 'exit' ]),
    enumerable : true
});

/**
 * All events which can be emitted by WorkerWrapper
 * @memberOf WorkerWrapper
 * @property {String[]} EVENTS
 * @static
 */
Object.defineProperty(WorkerWrapper, 'EVENTS', {
    value : Object.freeze([ 'error', 'state', 'ready', 'fork' ].concat(WorkerWrapper._PROXY_EVENTS)),
    enumerable : true
});

/**
 * @returns {Boolean}
 */
WorkerWrapper.prototype.isRunning = function() {
    return this.state === WorkerWrapper.STATES.LAUNCHING ||
        this.state === WorkerWrapper.STATES.RUNNING;
};

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
WorkerWrapper.prototype.run = function() {
    if (this.isRunning()) {
        this.emit('error',
            LusterWorkerWrapperError.createError(
                LusterWorkerWrapperError.CODES.INVALID_ATTEMPT_TO_CHANGE_STATE,
                {/*jshint indent:false*/
                    wid : this.wid,
                    pid : this.process.pid,
                    state : this.state,
                    targetState : WorkerWrapper.STATES.LAUNCHING
                }));

        return this;
    }

    var self = this;

    var fn = function() {
        var debugPort = self.options.debugPort;

        // Set individual debug ports for each worker.
        // For port number generation and assignment look for `Master#run` method.
        if (debugPort) {
            cluster.settings.execArgv.push('--debug=' + debugPort);
        }

        /** @private */
        self._worker = cluster.fork({
            port : self.options.port
        });

        if (debugPort) {
            cluster.settings.execArgv.pop();
        }

        /** @private */
        self._remoteCall = RPC.createCaller(self._worker);

        self._proxyEvents();
    };

    //hack for node v < 0.9.1
    timers.setImmediate ? setImmediate(fn) : process.nextTick(fn);

    return this;
};

/**
 * Disconnect worker to stop it.
 * @fires WorkerWrapper#error if worker status is 'stopped' or 'stopping'
 * @fires WorkerWrapper#status('stopping') on success
 * @returns {WorkerWrapper}
 */
WorkerWrapper.prototype.stop = function() {
    if ( ! this.isRunning()) {
        this.emit('error',
            LusterWorkerWrapperError.createError(
                LusterWorkerWrapperError.CODES.INVALID_ATTEMPT_TO_CHANGE_STATE,
                {/*jshint indent:false*/
                    wid : this.wid,
                    pid : this.process.pid,
                    state : this.state,
                    targetState : WorkerWrapper.STATES.STOPPING
                }));

        return this;
    }

    var self = this,
        fn = function() {
            self._worker.disconnect();
        };

    //hack for node v < 0.9.1
    timers.setImmediate ? setImmediate(fn) : process.nextTick(fn);

    return this;
};

/**
 * Set WorkerWrapper#restarting to `true` and stop it,
 * which leads to worker restart.
 */
WorkerWrapper.prototype.restart = function() {
    this.restarting = true;
    this.stop();
};

/**
 * Call Worker method via RPC
 * @method
 * @param {String} name of called command in the worker
 * @param {*} ...args
 */
WorkerWrapper.prototype.remoteCall = function(name) {
    if (this.isRunning()) {
        this._remoteCall.apply(this, arguments);
    } else {
        this.emit('error',
            LusterWorkerWrapperError.createError(
                LusterWorkerWrapperError.CODES.REMOTE_COMMAND_CALL_TO_STOPPED_WORKER,
                {/*jshint indent:false*/
                    wid : this.wid,
                    command : name
                }));
    }
};

// proxy some properties to WorkerWrapper#_worker
[ 'id', 'process', 'suicide' ].forEach(function(propName) {
    Object.defineProperty(WorkerWrapper.prototype, propName, {
        get : function() {
            return this._worker[propName];
        },
        enumerable : true
    });
});

// proxy some methods to WorkerWrapper#_worker
[ 'send', 'disconnect' ].forEach(function(methodName) {
    WorkerWrapper.prototype[methodName] = function() {
        this._worker[methodName].apply(this._worker, arguments);
    };
});

/**
 * repeat events from WorkerWrapper#_worker on WorkerWrapper
 * @private
 */
WorkerWrapper.prototype._proxyEvents = function() {
    WorkerWrapper._PROXY_EVENTS
        .forEach(function(eventName) {
            this._worker.on(eventName, this.emit.bind(this, eventName));
        }, this);
};

module.exports = WorkerWrapper;
