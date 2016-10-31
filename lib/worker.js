var cluster = require('cluster'),
    RPC = require('./rpc'),
    ClusterProcess = require('./cluster_process'),
    LusterWorkerError = require('./errors').LusterWorkerError,
    legacy = require('./legacy'),
    Worker;

/**
 * @constructor
 * @class Worker
 * @augments ClusterProcess
 */
Worker = ClusterProcess.create(function Worker() {
    Worker.__super.apply(this, arguments);

    /**
     * Worker id (alias for cluster.worker.id)
     * @memberOf {Worker}
     * @property {Number} id
     * @readonly
     * @public
     */
    Object.defineProperty(this, 'id', {
        value : cluster.worker.id,
        enumerable : true
    });

    var broadcastEvent = this._broadcastEvent;

    this._foreignPropertiesReceived = false;
    this.on('foreign properties received', function() { this._foreignPropertiesReceived = true; }.bind(this));

    this.on('configured', broadcastEvent.bind(this, 'configured'));
    this.on('extension loaded', broadcastEvent.bind(this, 'extension loaded'));
    this.on('initialized', broadcastEvent.bind(this, 'initialized'));
    this.on('loaded', broadcastEvent.bind(this, 'loaded'));
    this.on('ready', broadcastEvent.bind(this, 'ready'));

    this._ready = false;

    this.registerRemoteCommand(RPC.fns.worker.applyForeignProperties, this.applyForeignProperties.bind(this));
    this.registerRemoteCommand(RPC.fns.worker.broadcastMasterEvent, this.broadcastMasterEvent.bind(this));
});

/**
 * Emit an event received from the master as 'master <event>'.
 */
Worker.prototype.broadcastMasterEvent = function(proc, emitArgs) {
    var args = [ 'master ' + emitArgs[0] ].concat(emitArgs.slice(1));
    this.emit.apply(this, args);
};

/**
 * Transmit worker event to master, which plays as relay,
 * retransmitting it as 'worker <event>' to all master-side listeners.
 * @param {String} event Event name
 * @private
 */
Worker.prototype._broadcastEvent = function(event) {
    /* jshint unused:false */
    var args = [ RPC.fns.master.broadcastWorkerEvent ],
        i = 0,
        len = arguments.length;

    for (; i < len; i++) {
        args.push(arguments[i]);
    }

    this.remoteCall.apply(this, args);
};

/**
 * Extend {Worker} properties with passed by {Master}.
 * @param {ClusterProcess} proc
 * @param {*} props
 */
Worker.prototype.applyForeignProperties = function(proc, props) {
    Object.keys(props)
        .forEach(function(propName) {
            Object.defineProperty(this, propName, {
                value : props[propName],
                enumerable : true
            });
        }, this);
    this.emit('foreign properties received');
};

/**
 * @param {Function} fn
 */
Worker.whenForeignPropertiesReceived = function(fn) {
    return /** @this {Worker} */function() {
        if (this._foreignPropertiesReceived) {
            legacy.setImmediate(fn.bind(this));
        } else {
            this.once('foreign properties received', fn.bind(this));
        }

        return this;
    };
};

/**
 * `Require` application main script.
 * Execution will be delayed until Worker became configured
 * (`configured` event fired).
 * @returns {Worker} self
 * @public
 */
Worker.prototype.run = Worker.whenInitialized(
    Worker.whenForeignPropertiesReceived(function() {
        var workerBase = this.config.resolve('app');

        require(workerBase);
        this.emit('loaded', workerBase);

        if ( ! this.config.get('control.triggerReadyStateManually', false)) {
            legacy.setImmediate(this.ready.bind(this));
        }

        return this;
    }));

/**
 * @override
 * @see ClusterProcess
 * @private
 */
Worker.prototype._setupIPCMessagesHandler = function() {
    process.on('message', this._onMessage.bind(this, this));
};

/**
 * Call Master method via RPC
 * @method
 * @param {String} name of called command in the master
 * @param {*} ...args
 */
Worker.prototype.remoteCall = RPC.createCaller(process);

/**
 * Turns worker to `ready` state. Must be called by worker
 * if option `control.triggerReadyStateManually` set `true`.
 * @returns {Worker} self
 * @public
 */
Worker.prototype.ready = function () {
    if (this._ready) {
        throw new LusterWorkerError(LusterWorkerError.ALREADY_READY);
    }

    this._ready = true;
    this.emit('ready');

    return this;
};

module.exports = Worker;
