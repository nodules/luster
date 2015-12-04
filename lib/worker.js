var cluster = require('cluster'),
    RPC = require('./rpc'),
    ClusterProcess = require('./cluster_process'),
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

    this.on('extension loaded', broadcastEvent.bind(this, 'extension loaded'));
    this.on('configured', broadcastEvent.bind(this, 'configured'));
    this.on('initialized', broadcastEvent.bind(this, 'initialized'));
    this.on('loaded', broadcastEvent.bind(this, 'loaded'));
    this.on('ready', broadcastEvent.bind(this, 'ready'));

    this.registerRemoteCommand(RPC.fns.worker.applyForeignProperties, this.applyForeignProperties.bind(this));
});

/**
 * Transmit worker event to master, which plays as relay,
 * retransmitting it as 'worker <event>' to all master-side listeners.
 * @param {String} event Event name
 * @private
 */
Worker.prototype._broadcastEvent = function(event) {
    /* jshint unused:false */
    var args = [ RPC.fns.master.broadcastWorkerEvent],
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
        require(this.config.resolve('app'));
        this.emit('loaded');

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
 * Turns worker in 'ready' state, if it's already 'loaded'
 * Otherwise, sets an event listner for it
 * Designed to be used with triggerReadyStateManually option
 */
Worker.prototype.ready = function () {
    this.emit('ready');
}

module.exports = Worker;
