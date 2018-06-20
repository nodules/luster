const cluster = require('cluster'),
    path = require('path'),
    RPC = require('./rpc'),
    RPCCallback = require('./rpc-callback'),
    Configuration = require('./configuration'),
    EventEmitterEx = require('./event_emitter_ex'),
    LusterClusterProcessError = require('./errors').LusterClusterProcessError,
    LusterConfigurationError = require('./errors').LusterConfigurationError;

/**
 * @param {Object} context
 * @param {String} propName
 * @returns {Boolean}
 */
function has(context, propName) {
    return Object.prototype.hasOwnProperty.call(context, propName);
}

/**
 * Add `basedir`, `node_modules` contained in the `basedir` and its ancestors to `module.paths`
 * @param {String} basedir
 */
function extendResolvePath(basedir) {
    // using module internals isn't good, but restarting with corrected NODE_PATH looks more ugly, IMO
    module.paths.push(basedir);

    const _basedir = basedir.split('/'),
        size = basedir.length;
    let i = 0;

    while (size > i++) {
        const modulesPath = _basedir.slice(0, i).join('/') + '/node_modules';

        if (module.paths.indexOf(modulesPath) === -1) {
            module.paths.push(modulesPath);
        }
    }
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
class ClusterProcess extends EventEmitterEx {
    constructor() {
        super();

        /** @private */
        this._remoteCommands = {};
        /** @private */
        this.extensions = {};
        /**
         * @type Promise<void>
         * @private
         * */
        this._initPromise = new Promise(resolve => {
            this.once('initialized', resolve);
        });

        /**
         * @type {Configuration}
         * @public
         */
        this.config = null;

        this.once('configured', this._onConfigured.bind(this));

        this._setupIPCMessagesHandler();

        this.registerRemoteCommand(RPC.fns.callback, RPCCallback.processCallback.bind(RPCCallback));
    }

    /**
     * @memberOf ClusterProcess
     * @property {Boolean} isMaster
     * @readonly
     * @public
     */
    get isMaster() {
        return cluster.isMaster;
    }

    /**
     * @memberOf ClusterProcess
     * @property {Boolean} isWorker
     * @readonly
     * @public
     */
    get isWorker() {
        return cluster.isWorker;
    }

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
    configure(config, applyEnv, basedir) {
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
    }

    /**
     * @param {String} name
     * @param {Function} callback function(error)
     */
    loadExtension(name, callback) {
        const /** @type Extension */
            extension = require(name);
        let config = this.config.get('extensions.' + name);

        this.extensions[name] = extension;

        // if `config` was an Object then it became instance of Configuration
        // else returns original value
        config = Configuration.extend(config, this.config.getBaseDir());

        if (extension.configure.length > 2) {
            setImmediate(() => extension.configure(config, this, callback));
        } else {
            setImmediate(() => {
                extension.configure(config, this);
                callback();
            });
        }
    }

    /**
     * @event ClusterProcess#initialized
     */

    /**
     * @fires ClusterProcess#initialized
     * @private
     */
    _onConfigured() {
        cluster.setMaxListeners(this.getMaxListeners());

        // try to use `extensionsPath` option to resolve extensions' modules
        // use worker file directory as fallback
        extendResolvePath(path.resolve(
            this.config.resolve('extensionsPath', path.dirname(this.config.resolve('app')))
        ));

        const extensions = this.config.getKeys('extensions'),
            wait = extensions.length,
            loadedExtensions = new Set(),
            loadTimeout = this.config.get('extensionsLoadTimeout', 10000);
        let loadTimer;

        if (wait === 0) {
            this.emit('initialized');
            return;
        }

        extensions.forEach(name => {
            this.loadExtension(name, error => {
                if (error) {
                    return this.emit('error', error);
                }

                loadedExtensions.add(name);
                this.emit('extension loaded', name);

                if (loadedExtensions.size === wait) {
                    clearTimeout(loadTimer);
                    this.emit('initialized');
                }
            });
        });

        loadTimer = setTimeout(() => {
            const timeouted = extensions.filter(name => !loadedExtensions.has(name)),
                error = LusterClusterProcessError.createError(
                    LusterClusterProcessError.CODES.EXTENSIONS_LOAD_TIMEOUT,
                    {timeouted, timeout: loadTimeout});

            this.emit('error', error);
        }, loadTimeout);
    }

    /**
     * Resolves when ClusterProcess done initialization.
     * @this {ClusterProcess}
     * @returns {Promise<void>}
     */
    whenInitialized() {
        return this._initPromise;
    }

    /**
     * Register `fn` as allowed for remote call via IPC.
     * @param {String} name
     * @param {Function} fn
     * @throws LusterClusterProcessError if remote procedure with `name` already registered.
     * @public
     */
    registerRemoteCommand(name, fn) {
        if (has(this._remoteCommands, name)) {
            throw LusterClusterProcessError.createError(
                LusterClusterProcessError.CODES.REMOTE_COMMAND_ALREADY_REGISTERED,
                {name});
        }

        this._remoteCommands[name] = fn;
    }

    /**
     * Remove previously registered remote command
     * @param {String} name
     * @public
     */
    unregisterRemoteCommand(name) {
        delete this._remoteCommands[name];
    }

    /**
     * Checks is remote command registered.
     * @param {String} name
     * @returns {Boolean}
     */
    hasRegisteredRemoteCommand(name) {
        return has(this._remoteCommands, name);
    }

    /**
     * @abstract
     * @throws LusterClusterProcessError if method is not overriden in the inheritor of ClusterProcess
     * @private
     */
    _setupIPCMessagesHandler() {
        throw LusterClusterProcessError.createError(
            LusterClusterProcessError.CODES.ABSTRACT_METHOD_IS_NOT_IMPLEMENTED,
            {
                method: 'ClusterProcess#_setupIPCMessagesHandler',
                klass: this.constructor.name
            });
    }

    /**
     * Call function registered as remote command if `rawMessage` is valid luster IPC message
     * @param {WorkerWrapper|Worker} target object with `remoteCall` method which can be used to respond to message
     * @param {*} rawMessage
     * @see RPC
     * @private
     */
    _onMessage(target, rawMessage) {
        const message = RPC.parseMessage(rawMessage);

        if (message === null) {
            return;
        }

        if (!has(this._remoteCommands, message.cmd)) {
            throw LusterClusterProcessError.createError(
                LusterClusterProcessError.CODES.REMOTE_COMMAND_IS_NOT_REGISTERED,
                {
                    name: message.cmd,
                    klass: this.constructor.name
                });
        } else if (typeof message.args === 'undefined') {
            this._remoteCommands[message.cmd](target);
        } else {
            this._remoteCommands[message.cmd](target, ...message.args);
        }
    }

    /**
     * Register remote command with respect to the presence of callback
     * @param {String} command
     * @param {Function} handler
     */
    registerRemoteCommandWithCallback(command, handler) {
        /**
         * @param {ClusterProcess} proc
         * @param {*} [data]
         * @param {String} callbackId
         */
        this.registerRemoteCommand(command, (proc, data, callbackId) => {
            /**
             * @param {*} [callbackData]
             */
            return handler(callbackData => {
                proc.remoteCall(RPC.fns.callback, callbackId, callbackData);
            }, data);
        });
    }
}

module.exports = ClusterProcess;
