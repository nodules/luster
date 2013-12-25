var cluster = require('cluster'),
    path = require('path'),
    RPC = require('./rpc'),
    Configurable = require('./configurable'),
    LusterClusterProcessError = require('./errors').LusterClusterProcessError,
    ClusterProcess;

/**
 * @param {Object} context
 * @param {String} propName
 * @returns {Boolean}
 */
function has(context, propName) {
    return Object.prototype.hasOwnProperty.call(context, propName);
}

/**
 * @typedef Extension
 * @property {Function} [configure] (Object config, ClusterProcess proc)
 */

/**
 * @constructor
 * @class ClusterProcess
 * @augments Configurable
 */
ClusterProcess = Configurable.create(function ClusterProcess() {
    ClusterProcess.__super.apply(this, arguments);

    /** @private */
    this._remoteCommands = {};
    /** @private */
    this._initialized = false;
    /** @private */
    this.extensions = {};

    this.once('configured', this._onConfigured.bind(this));

    this._setupIPCMessagesHandler();
});

/**
 * @memberOf ClusterProcess
 * @property {Boolean} isMaster
 * @readonly
 * @public
 */
Object.defineProperty(ClusterProcess.prototype, 'isMaster', {
    value : cluster.isMaster,
    enumerable : true
});

/**
 * @memberOf ClusterProcess
 * @property {Boolean} isWorker
 * @readonly
 * @public
 */
Object.defineProperty(ClusterProcess.prototype, 'isWorker', {
    value : cluster.isWorker,
    enumerable : true
});

/**
 * @param {String} name
 */
ClusterProcess.prototype.loadExtension = function(name) {
    var /** @type Extension */
        extension = require(name),
        config = this.config.get('extensions.' + name);

    this.extensions[name] = extension;

    // if `config` was an Object then it became instance of Configuration
    // else returns original value
    config = this.extendConfig(config);

    if (typeof extension.configure === 'function') {
        extension.configure(config, this);
    } else {
        extension.config = config;
    }
};

/**
 * Add `basedir`, `node_modules` contained in the `basedir` and its ancestors to `module.paths`
 * @param {String} basedir
 */
function extendResolvePath(basedir) {
    // using module internals isn't good, but restarting with corrected NODE_PATH looks more ugly, IMO
    module.paths.push(basedir);

    var _basedir = basedir.split('/'),
        size = basedir.length,
        i = 0,
        modulesPath;

    while (size > i++) {
        modulesPath = _basedir.slice(0, i).join('/') + '/node_modules';

        if (module.paths.indexOf(modulesPath) === -1) {
            module.paths.push(modulesPath);
        }
    }
}

/**
 * @event ClusterProcess#initialized
 */

/**
 * @fires ClusterProcess#initialized
 * @private
 */
ClusterProcess.prototype._onConfigured = function() {
    // try to use `extensionsPath` option to resolve extensions' modules
    // use worker file directory as fallback
    extendResolvePath(path.dirname(
        this.config.resolve('extensionsPath', this.config.resolve('app'))
    ));

    this.config
        .getKeys('extensions')
        .forEach(this.loadExtension, this);

    cluster.setMaxListeners(this._maxListeners);

    this._initialized = true;
    this.emit('initialized');
};

/**
 * Wrap `fn` to delay it execution to ClusterProcess done initialization.
 * @this {ClusterProcess}
 * @param {Function} fn
 * @returns {Function}
 */
ClusterProcess.whenInitialized = function(fn) {
    return /** @this {ClusterProcess} */function() {
        if (this._initialized) {
            setImmediate(fn.bind(this));
        } else {
            this.once('initialized', fn.bind(this));
        }

        return this;
    };
};

/**
 * Register `fn` as allowed for remote call via IPC.
 * @param {String} name
 * @param {Function} fn
 * @throws LusterClusterProcessError if remote procedure with `name` already registered.
 * @public
 */
ClusterProcess.prototype.registerRemoteCommand = function(name, fn) {
    if (has(this._remoteCommands, name)) {
        throw LusterClusterProcessError.createError(
            LusterClusterProcessError.CODES.REMOTE_COMMAND_ALREADY_REGISTERED,
            { name : name });
    }

    this._remoteCommands[name] = fn;
};

/**
 * Remove previously registered remote command
 * @param {String} name
 * @public
 */
ClusterProcess.prototype.unregisterRemoteCommand = function(name) {
    delete this._remoteCommands[name];
};

/**
 * @abstract
 * @throws LusterClusterProcessError if method is not overriden in the inheritor of ClusterProcess
 * @private
 */
ClusterProcess.prototype._setupIPCMessagesHandler = function() {
    throw LusterClusterProcessError.createError(
        LusterClusterProcessError.CODES.ABSTRACT_METHOD_IS_NOT_IMPLEMENTED,
        {
            method : 'ClusterProcess#_setupIPCMessagesHandler',
            klass : this.constructor.name
        });
};

/**
 * Call function registered as remote command if `rawMessage` is valid luster IPC message
 * @param {WorkerWrapper|Worker} target object with `remoteCall` method which can be used to respond to message
 * @param {*} rawMessage
 * @see RPC
 * @private
 */
ClusterProcess.prototype._onMessage = function(target, rawMessage) {
    var message = RPC.parseMessage(rawMessage);

    if (message === null) {
        return;
    }

    if ( ! has(this._remoteCommands, message.cmd)) {
        throw LusterClusterProcessError.createError(
            LusterClusterProcessError.CODES.REMOTE_COMMAND_IS_NOT_REGISTERED,
            {
                name : message.cmd,
                klass : this.constructor.name
            });
    } else if (typeof message.args === 'undefined') {
        this._remoteCommands[message.cmd].call(null, target);
    } else {
        this._remoteCommands[message.cmd].apply(null, [target].concat(message.args));
    }
};

module.exports = ClusterProcess;