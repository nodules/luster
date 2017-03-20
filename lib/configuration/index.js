var path = require('path'),
    typeOf = require('./helpers').typeOf,
    get = require('./helpers').get,
    set = require('./helpers').set,
    has = require('./helpers').has;

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
 * @returns {String} base dir used in `resolve()`
 * @public
 */
Configuration.prototype.getBaseDir = function() {
    return this._resolveBaseDir;
};

/**
 * Create Configuration instance from plain object
 * @param {Object|*} config
 * @param {String} basedir - base dir for `resolve` method
 * @returns {Configuration|*} Configuration instance if `config` is object or `config` itself in other case
 * @public
 * @static
 */
Configuration.extend = function(config, basedir) {
    return typeOf(config) === 'object' ?
        new Configuration(config, basedir) :
        config;
};

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
 *        # { server: { port: 8080 } }
 *
 *      LUSTER_CONF='app=./worker_debug.js; workers=1'
 *        # { app: "./worker_debug.js", workers : 1 }
 *
 *      LUSTER_CONF='logStream='
 *        # remove option "logStream"
 *
 *      LUSTER_CONF='server={"port":8080}'
 *        # { server: { port: 8080 } }
 *
 * @param {Object} config
 * @throws {LusterConfigurationError} if you trying to
 *      set property of atomic property, for example,
 *      error will be thrown if you have property
 *      `extensions.sample.x = 10` in the configuration and
 *      environment variable `LUSTER_EXTENSIONS_SAMPLE_X_Y=5`
 */
Configuration.applyEnvironment = function(config) {
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
            } catch(error) { // eslint-disable-line no-empty
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
};

Configuration.check = require('./check');

module.exports = Configuration;
