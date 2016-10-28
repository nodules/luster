var util = require('util'),
    path = require('path'),
    EventEmitterEx = require('./event_emitter_ex'),
    LusterConfigurationError = require('./errors').LusterConfigurationError,
    CHECKS,
    Configurable;

/**
 * @typedef PropertyCheck
 * @property {Boolean} required default: `false`
 * @property {String|String[]} type `typeOf()` result
 */

/**
 * Hash of configuration properties checks.
 * Keys are properties paths, values – checks descriptors.
 * @const
 * @type {Object}
 * @property {PropertyCheck} *
 */
CHECKS = {
    // path to worker main module
    'app' : { required : true, type : 'string' },
    // number of workers to spawn
    'workers' : { type : 'number' },

    // time (in ms) to wait for `online` event from worker
    'control.forkTimeout' : { type : 'number' },
    // time (in ms) to wait for `exit` event from worker after `disconnect`
    'control.stopTimeout' : { type : 'number' },
    // if worker dies in `threshold` ms then it's restarts counter increased
    'control.exitThreshold' : { type : 'number' },
    // allowed restarts before mark worker as dead
    'control.allowedSequentialDeaths' : { type : 'number' },

    // initial port for workers
    'server.port' : { type : [ 'number', 'string' ] },
    // increase port for every group
    'server.groups' : { type : 'number' },

    // every worker has unique debug port (debug.port + worker number)
    'debug.port' : { type : 'number' },

    // hash of extensions; keys – modules' names, values – extensions' configs
    'extensions' : { type : 'object' },
    // path to node_modules directory which contains extensions
    // configuration directory used by default
    'extensionsPath' : { type : 'string' },
    // time to wait for configuration of all extensions
    'extensionsLoadTimeout' : { type : 'number' }
};

/**
 * @param {*} value
 * @returns {String} `typeof` result extended with 'array', 'regexp', 'date' and 'error'
 */
function typeOf(value) {
    var type = typeof value;

    if (type === 'object') {
        if (util.isArray(value)) {
            type = 'array';
        } else if (util.isRegExp(value)) {
            type = 'regexp';
        } else if (util.isDate(value)) {
            type = 'date';
        } else if (util.isError(value)) {
            type = 'error';
        }
    }

    return type;
}

/**
 * @param {Object} context
 * @param {String} path
 * @param {*} value
 */
function set(context, path, value) {
    var ctx = context,
        props = path.split('.'),
        target = props.pop(),
        i, size,
        propName,
        type;

    for (i = 0, size = props.length; i < size; i++) {
        propName = props[i];
        type = typeOf(ctx[propName]);

        if (type === 'undefined') {
            ctx[propName] = {};
        } else if (type !== 'object') {
            throw LusterConfigurationError.createError(
                LusterConfigurationError.CODES.CAN_NOT_SET_ATOMIC_PROPERTY_FIELD,
                { path : props.slice(0, i).join('.') });
        }

        ctx = ctx[propName];
    }

    ctx[target] = value;
}

/**
 * @param {*} context
 * @param {String} [path]
 * @param {*} [defaultValue]
 * @returns {*} property by path or default value if absent
 */
function get(context, path, defaultValue) {
    if (typeof path === 'undefined' || path === '') {
        return context;
    }

    var props = path.split('.'),
        prop = props[0],
        i, size,
        ctx = context;

    for (i = 0, size = props.length; i < size; prop = props[++i]) {
        if (typeof ctx === 'undefined' || ctx === null ||
            ! Object.prototype.hasOwnProperty.call(ctx, prop)) {
            return defaultValue;
        }

        ctx = ctx[prop];
    }

    return ctx;
}

/**
 * @param {*} context
 * @param {String} [path]
 * @returns {Boolean} `true` if property exists
 */
function has(context, path) {
    if (typeof path === 'undefined' || path === '') {
        return context;
    }

    var props = path.split('.'),
        prop = props[0],
        i, size,
        ctx = context;

    for (i = 0, size = props.length; i < size; prop = props[++i]) {
        if (typeof ctx === 'undefined' || ctx === null ||
            ! Object.prototype.hasOwnProperty.call(ctx, prop)) {
            return false;
        }

        ctx = ctx[prop];
    }

    return true;
}

/**
 * @param {String} path to property
 * @param {*} value
 * @param {PropertyCheck} check value description
 * @throws {LusterConfigurationError} if property check has been failed
 */
function checkProperty(path, value, check) {
    var type = typeOf(value),
        allowedTypes;

    // required property
    if (type === 'undefined') {
        if (check.required) {
            throw LusterConfigurationError.createError(
                LusterConfigurationError.CODES.PROP_REQUIRED,
                { property : path });
        } else {
            return;
        }
    }

    // allowed types
    allowedTypes = check.type && [].concat(check.type);
    if (allowedTypes && allowedTypes.indexOf(type) === -1) {
        throw LusterConfigurationError.createError(
            LusterConfigurationError.CODES.PROP_TYPE_CHECK_FAILED,
            {
                property : path,
                type : type,
                expected : allowedTypes.join(' or ')
            });
    }
}

/**
 * Validate configuration object using descriptions from CHECKS const
 * @param {Object} conf configuration object
 * @returns {Number} of failed checks
 */
function check(conf) {
    var failedChecks = 0;

    Object
        .keys(CHECKS)
        .forEach(function(path) {
            // @todo avoid try..catch
            try {
                checkProperty(path, get(conf, path), CHECKS[path]);
            } catch (error) {
                LusterConfigurationError.ensureError(error).log();
                ++failedChecks;
            }
        });

    return failedChecks;
}

/**
 * Override config properties using `LUSTER_CONF` environment variable.
 *
 * @description
 *      LUSTER_CONF='PATH=VALUE;...'
 *
 *      ; – properties separator;
 *      = – property and value separator;
 *      PATH – property path;
 *      VALUE – property value, JSON.parse applied to it,
 *          if JSON.parse failed, then value used as string.
 *          You MUST quote a string if it contains semicolon.
 *
 *      Spaces between PATH, "=", ";" and VALUE are insignificant.
 *
 * @example
 *      LUSTER_CONF='server.port=8080'
 *        # { server : { port : 8080 } }
 *
 *      LUSTER_CONF='app=./worker_debug.js; workers=1'
 *        # { app : "./worker_debug.js", workers : 1 }
 *
 *      LUSTER_CONF='logStream='
 *        # remove option "logStream"
 *
 *      LUSTER_CONF='server={"port":8080}'
 *        # { server : { port : 8080 } }
 *
 * @param {Object} config
 * @throws {LusterConfigurationError} if you trying to
 *      set property of atomic property, for example,
 *      error will be thrown if you have property
 *      `extensions.sample.x = 10` in the configuration and
 *      environment variable `LUSTER_EXTENSIONS_SAMPLE_X_Y=5`
 */
function applyEnvironment(config) {
    if ( ! process.env.LUSTER_CONF) {
        return;
    }

    function parseProp(prop) {
        var delimeterPos = prop.indexOf('='),
            propPath,
            propValue;

        if (delimeterPos === 0 || delimeterPos === -1) {
            return;
        }

        propPath = prop.substr(0, delimeterPos).trim();
        propValue = prop.substr(delimeterPos + 1).trim();

        if (propValue === '') {
            propValue = undefined;
        } else {
            try {
                // try to parse propValue as JSON,
                // if parsing failed use raw `propValue` as string
                propValue = JSON.parse(propValue);
            } catch(error) {
            }
        }

        set(config, propPath, propValue);
    }

    var conf = process.env.LUSTER_CONF,
        lastSeparator = -1,
        i = 0,
        openQuote = false;

    while (conf.length > i++) {
        switch (conf[i]) {
        case '"' :
            openQuote = ! openQuote;
            break;
        case ';' :
            if ( ! openQuote) {
                parseProp(conf.substring(lastSeparator + 1, i));
                lastSeparator = i;
            }
        }
    }

    if (lastSeparator < conf.length) {
        parseProp(conf.substring(lastSeparator + 1));
    }
}

/**
 * @constructor
 * @class Configuration
 */
function Configuration(config, basedir) {
    /** @private */
    this._resolveBaseDir = basedir || process.cwd();

    Object
        .keys(config)
        .forEach(function(propName) {
            this[propName] = config[propName];
        }, this);
}

/**
 * @param {String} path
 * @param {*} [defaultValue]
 * @returns {*}
 * @see get
 * @public
 */
Configuration.prototype.get = function(path, defaultValue) {
    return get(this, path, defaultValue);
};

/**
 * @param {String} path
 * @returns {Boolean}
 * @see has
 * @public
 */
Configuration.prototype.has = function(path) {
    return has(this, path);
};

/**
 * Shortcut for `Object.keys(c.get('some.obj.prop', {}))`
 * @param {String} [path]
 * @returns {String[]} keys of object property by path or
 *      empty array if property doesn't exists or not an object
 * @public
 */
Configuration.prototype.getKeys = function(path) {
    var obj = get(this, path);

    if (typeOf(obj) !== 'object') {
        return [];
    } else {
        return Object.keys(obj);
    }
};

/**
 * Shortcut for `path.resolve(process.cwd(), c.get(path, 'default.file'))`
 * @param {String} propPath
 * @param {String} [defaultPath]
 * @returns {String} absolute path
 * @public
 */
Configuration.prototype.resolve = function(propPath, defaultPath) {
    return path.resolve(
        this._resolveBaseDir,
        get(this, propPath, defaultPath));
};

/**
 * @constructor
 * @class Configurable
 * @augments EventEmitterEx
 */
Configurable = EventEmitterEx.create();

/**
 * base directory for Configuration#resolve method
 * @private
 * @static
 * @type {String}
 */
Configurable.prototype._resolveBaseDir = process.cwd();

/**
 * create Configuration instance from plain object
 * @param {Object} config
 * @returns {Configuration|*} Configuration instance if `config` is object or `config` itself in other case
 * @public
 */
Configurable.prototype.extendConfig = function(config) {
    return typeOf(config) === 'object' ?
        new Configuration(config, this._resolveBaseDir) :
        config;
};

/**
 * @event Configurable#configured
 */

/**
 * @fires Configurable#configured
 * @param {Object} config
 * @param {Boolean} [applyEnv=true]
 * @param {String} [basedir=process.cwd()] for Configuration#resolve relative paths
 * @returns {Configurable} this
 * @throws {LusterConfigurationError} if configuration check failed (check errors will be logged to STDERR)
 * @public
 */
Configurable.prototype.configure = function(config, applyEnv, basedir) {
    if (typeof applyEnv === 'undefined' || applyEnv) {
        // @todo may be create a deep copy and do not modify origin?
        applyEnvironment(config);
    }

    if (basedir) {
        /** @private */
        this._resolveBaseDir = basedir;
    }

    if (check(config) > 0) {
        this.emit('error',
            LusterConfigurationError.createError(
                LusterConfigurationError.CODES.CONFIGURATION_CHECK_FAILED));
    } else {
        /** @public */
        this.config = this.extendConfig(config);

        // hack to tweak underlying EventEmitter max listeners
        // if your luster-based app extensively use luster events
        this.setMaxListeners(this.config.get('maxEventListeners', 100));

        this.emit('configured');
    }

    return this;
};

module.exports = Configurable;
