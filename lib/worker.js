const cluster = require('cluster'),
    RPC = require('./rpc'),
    RPCCallback = require('./rpc-callback'),
    ClusterProcess = require('./cluster_process'),
    LusterWorkerError = require('./errors').LusterWorkerError;

const wid = parseInt(process.env.LUSTER_WID, 10);

/**
 * @constructor
 * @class Worker
 * @augments ClusterProcess
 */
class Worker extends ClusterProcess {
    constructor() {
        super();

        const broadcastEvent = this._broadcastEvent;

        this._foreignPropertiesReceived = false;
        this.on('foreign properties received', () => this._foreignPropertiesReceived = true);

        this.on('configured', broadcastEvent.bind(this, 'configured'));
        this.on('extension loaded', broadcastEvent.bind(this, 'extension loaded'));
        this.on('initialized', broadcastEvent.bind(this, 'initialized'));
        this.on('loaded', broadcastEvent.bind(this, 'loaded'));
        this.on('ready', broadcastEvent.bind(this, 'ready'));
        cluster.worker.on('disconnect', this.emit.bind(this, 'disconnect'));

        this._ready = false;

        this.registerRemoteCommand(RPC.fns.worker.applyForeignProperties, this.applyForeignProperties.bind(this));
        this.registerRemoteCommand(RPC.fns.worker.broadcastMasterEvent, this.broadcastMasterEvent.bind(this));
    }

    /**
     * @memberOf {Worker}
     * @property {Number} Persistent Worker identifier
     * @readonly
     * @public
     */
    get wid(){
        return wid;
    }

    /**
     * Worker id (alias for cluster.worker.id)
     * @memberOf {Worker}
     * @property {Number} id
     * @readonly
     * @public
     */
    get id() {
        return cluster.worker.id;
    }

    /**
     * Emit an event received from the master as 'master <event>'.
     */
    broadcastMasterEvent(proc, emitArgs) {
        const args = ['master ' + emitArgs[0]].concat(emitArgs.slice(1));
        this.emit.apply(this, args);
    }

    /**
     * Transmit worker event to master, which plays as relay,
     * retransmitting it as 'worker <event>' to all master-side listeners.
     * @param {String} event Event name
     * @param {...*} args
     * @private
     */
    _broadcastEvent(event, ...args) {
        this.remoteCall(RPC.fns.master.broadcastWorkerEvent, event, ...args);
    }

    /**
     * Extend {Worker} properties with passed by {Master}.
     * @param {ClusterProcess} proc
     * @param {*} props
     */
    applyForeignProperties(proc, props) {
        for (const propName of Object.keys(props)) {
            Object.defineProperty(this, propName, {
                value: props[propName],
                enumerable: true
            });
        }
        this.emit('foreign properties received');
    }

    whenForeignPropertiesReceived() {
        return new Promise(resolve => {
            if (this._foreignPropertiesReceived) {
                resolve();
            } else {
                this.once('foreign properties received', resolve);
            }
        });
    }

    /**
     * @override
     * @see ClusterProcess
     * @private
     */
    _setupIPCMessagesHandler() {
        process.on('message', this._onMessage.bind(this, this));
    }

    /**
     * Turns worker to `ready` state. Must be called by worker
     * if option `control.triggerReadyStateManually` set `true`.
     * @returns {Worker} self
     * @public
     */
    ready() {
        if (this._ready) {
            throw new LusterWorkerError(LusterWorkerError.CODES.ALREADY_READY);
        }

        this._ready = true;
        this.emit('ready');

        return this;
    }

    /**
     * Do a remote call to master, wait for master to handle it, then execute registered callback
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

    async _run() {
        await this.whenInitialized();
        await this.whenForeignPropertiesReceived();

        const workerBase = this.config.resolve('app');

        require(workerBase);
        this.emit('loaded', workerBase);

        if (!this.config.get('control.triggerReadyStateManually', false)) {
            setImmediate(this.ready.bind(this));
        }
    }

    /**
     * `Require` application main script.
     * Execution will be delayed until Worker became configured
     * (`configured` event fired).
     * @returns {Worker} self
     * @public
     */
    run() {
        this._run();
        return this;
    }
}

/**
 * Call Master method via RPC
 * @method
 * @param {String} name of called command in the master
 * @param {*} ...args
 */
Worker.prototype.remoteCall = RPC.createCaller(process);

module.exports = Worker;
