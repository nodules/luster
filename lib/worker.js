var cluster = require('cluster'),
    RPC = require('./rpc'),
    ClusterProcess = require('./cluster_process'),
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

    // @todo: kaero: move RPC functions names to dictionary in the shared file
    this.registerRemoteCommand('core.worker.applyForeignProperties', this.applyForeignProperties.bind(this));
});

/**
 * Extend {Worker} properties with passed by {Master}.
 * @param {ClusterProcess} proc
 * @param {*} props
 */
Worker.prototype.applyForeignProperties = function(proc, props) {
    Object.keys( props)
        .forEach(function(propName) {
            Object.defineProperty(this, propName, {
                value : props[propName],
                enumerable : true
            });
        }, this);
};

/**
 * `Require` application main script.
 * Execution will be delayed until Worker became configured
 * (`configured` event fired).
 * @returns {Worker} self
 * @public
 */
Worker.prototype.run = Worker.whenInitialized(function() {
    require(this.config.resolve('app'));

    return this;
});

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

module.exports = Worker;
