var cluster = require('cluster'),
    path = require('path'),
    RPC = require('./rpc'),
    RPCCallback = require('./rpc-callback'),
    Configuration = require('./configuration'),
    EventEmitterEx = require('./event_emitter_ex'),
    LusterClusterProcessError = require('./errors').LusterClusterProcessError,
    LusterConfigurationError = require('./errors').LusterConfigurationError,
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
 * @augments EventEmitterEx
 */
ClusterProcess = EventEmitterEx.create(function ClusterProcess() {
    ClusterProcess.__super.apply(this, arguments);

    /** @private */
    this._remoteCommands = {};
    /** @private */
    this._initialized = false;
    /** @private */
    this.extensions = {};

    /**
     * @type {Configuration}
     * @public
     */
    this.config = null;

    this.once('configured', this._onConfigured.bind(this));

    this._setupIPCMessagesHandler();

    this.registerRemoteCommand(RPC.fns.callback, RPCCallback.processCallback.bind(RPCCallback));
});

/**
 * @memberOf ClusterProcess
 * @property {Boolean} isMaster
 * @readonly
 * @public
 */
Object.defineProperty(ClusterProcess.prototype, 'isMaster', {
    value: cluster.isMaster,
    enumerable: true
});

/**
 * @memberOf ClusterProcess
 * @property {Boolean} isWorker
 * @readonly
 * @public
 */
Object.defineProperty(ClusterProcess.prototype, 'isWorker', {
    value: cluster.isWorker,
    enumerable: true
});

/**
 * @event ClusterProcess#configured
 */

/**
 * @fires ClusterProcess#configured
 * @param {Object} config
 * @param {Boolean} [applyEnv=true]
 * @param {String} [basedir=process.cwd()] for Configuration#resolve relative paths
 * @returns {ClusterProcess} this
 * @throws {LusterConfigurationError} if configuration check failed (check errors will be logged to STDERR)
 * @public
 */
ClusterProcess.prototype.configure = function(config, applyEnv, basedir) {
    if (typeof applyEnv === 'undefined' || applyEnv) {
        Configuration.applyEnvironment(config);
    }

    if (typeof(basedir) === 'undefined') {
        basedir = process.cwd();
    }

    if (Configuration.check(config) > 0) {
        this.emit('error',
            LusterConfigurationError.createError(
                LusterConfigurationError.CODES.CONFIGURATION_CHECK_FAILED));
    } else {
        this.config = Configuration.extend(config, basedir);

        // hack to tweak underlying EventEmitter max listeners
        // if your luster-based app extensively use luster events
        this.setMaxListeners(this.config.get('maxEventListeners', 100));

        this.emit('configured');
    }

    return this;
};

/**
 * @param {String} name
 * @param {Function} callback function(error)
 */
ClusterProcess.prototype.loadExtension = function(name, callback) {
    var /** @type Extension */
        extension = require(name),
        self = this,
        config = this.config.get('extensions.' + name);

    this.extensions[name] = extension;

    // if `config` was an Object then it became instance of Configuration
    // else returns original value
    config = Configuration.extend(config, this.config.getBaseDir());

    if (extension.configure.length > 2) {
        setImmediate(function() {
            extension.configure(config, self, callback);
        });
    } else {
        setImmediate(function() {
            extension.configure(config, self);
            callback();
        });
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
    cluster.setMaxListeners(this.getMaxListeners());

    // try to use `extensionsPath` option to resolve extensions' modules
    // use worker file directory as fallback
    extendResolvePath(path.resolve(
        this.config.resolve('extensionsPath', path.dirname(this.config.resolve('app')))
    ));

    var self = this,
        extensions = this.config.getKeys('extensions'),
        wait = extensions.length,
        loadedExtensions = [],
        loadTimeout = this.config.get('extensionsLoadTimeout', 10000),
        loadTimer;

    if (wait === 0) {
        self._initialized = true;
        self.emit('initialized');
        return;
    }

    extensions.forEach(function(name) {
        this.loadExtension(name, function(error) {
            if (error) {
                return self.emit('error', error);
            }

            loadedExtensions.push(name);
            self.emit('extension loaded', name);

            if (loadedExtensions.length === wait) {
                clearTimeout(loadTimer);
                self._initialized = true;
                self.emit('initialized');
            }
        });
    }, this);

    loadTimer = setTimeout(function() {
        var timeouted = extensions.filter(function (name) {
                return loadedExtensions.indexOf(name) < 0;
            }),
            error = LusterClusterProcessError.createError(
                LusterClusterProcessError.CODES.EXTENSIONS_LOAD_TIMEOUT,
                { timeouted: timeouted, timeout: loadTimeout });

        self.emit('error', error);
    }, loadTimeout);
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
            { name: name });
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
 * Checks is remote command registered.
 * @param {String} name
 * @returns {Boolean}
 */
ClusterProcess.prototype.hasRegisteredRemoteCommand = function(name) {
    return has(this._remoteCommands, name);
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
            method: 'ClusterProcess#_setupIPCMessagesHandler',
            klass: this.constructor.name
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
                name: message.cmd,
                klass: this.constructor.name
            });
    } else if (typeof message.args === 'undefined') {
        this._remoteCommands[message.cmd].call(null, target);
    } else {
        this._remoteCommands[message.cmd].apply(null, [target].concat(message.args));
    }
};

/**
 * Register remote command with respect to the presence of callback
 * @param {String} command
 * @param {Function} handler
 */
ClusterProcess.prototype.registerRemoteCommandWithCallback = function(command, handler) {
    /**
     * @param {ClusterProcess} proc
     * @param {*} [data]
     * @param {String} callbackId
     */
    this.registerRemoteCommand(command, function(proc, data, callbackId) {
        /**
         * @param {*} [callbackData]
         */
        return handler(function(callbackData) {
            proc.remoteCall(RPC.fns.callback, callbackId, callbackData);
        }, data);
    });
};

module.exports = ClusterProcess;
