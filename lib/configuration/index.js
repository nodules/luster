const path = require('path'),
    typeOf = require('./helpers').typeOf,
    get = require('./helpers').get,
    set = require('./helpers').set,
    has = require('./helpers').has;

/**
 * @constructor
 * @class Configuration
 */
class Configuration {
    constructor(config, basedir) {
        /** @private */
        this._resolveBaseDir = basedir || process.cwd();

        if (config instanceof Configuration) {
            config = config._rawConfig;
        }
        this._rawConfig = {};
        Object.assign(this._rawConfig, config);
    }

    /**
     * @param {String} path
     * @param {*} [defaultValue]
     * @returns {*}
     * @see get
     * @public
     */
    get(path, defaultValue) {
        return get(this._rawConfig, path, defaultValue);
    }

    /**
     * @param {String} path
     * @returns {Boolean}
     * @see has
     * @public
     */
    has(path) {
        return has(this._rawConfig, path);
    }

    /**
     * Shortcut for `Object.keys(c.get('some.obj.prop', {}))`
     * @param {String} [path]
     * @returns {String[]} keys of object property by path or
     *      empty array if property doesn't exists or not an object
     * @public
     */
    getKeys(path) {
        const obj = get(this._rawConfig, path);

        if (typeOf(obj) !== 'object') {
            return [];
        } else {
            return Object.keys(obj);
        }
    }

    /**
     * Shortcut for `path.resolve(process.cwd(), c.get(path, 'default.file'))`
     * @param {String} propPath
     * @param {String} [defaultPath]
     * @returns {String} absolute path
     * @public
     */
    resolve(propPath, defaultPath) {
        return path.resolve(
            this._resolveBaseDir,
            get(this._rawConfig, propPath, defaultPath));
    }

    /**
     * @returns {String} base dir used in `resolve()`
     * @public
     */
    getBaseDir() {
        return this._resolveBaseDir;
    }

    /**
     * Create Configuration instance from plain object
     * @param {Object|*} config
     * @param {String} basedir - base dir for `resolve` method
     * @returns {Configuration|*} Configuration instance if `config` is object or `config` itself in other case
     * @public
     * @static
     */
    static extend(config, basedir) {
        return typeOf(config) === 'object' ?
            new Configuration(config, basedir) :
            config;
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
    static applyEnvironment(config) {
        if (!process.env.LUSTER_CONF) {
            return;
        }

        if (config instanceof Configuration) {
            config = config._rawConfig;
        }

        function parseProp(prop) {
            const delimeterPos = prop.indexOf('=');

            if (delimeterPos === 0 || delimeterPos === -1) {
                return;
            }

            const propPath = prop.substr(0, delimeterPos).trim();
            let propValue = prop.substr(delimeterPos + 1).trim();

            if (propValue === '') {
                propValue = undefined;
            } else {
                try {
                    // try to parse propValue as JSON,
                    // if parsing failed use raw `propValue` as string
                    propValue = JSON.parse(propValue);
                } catch (error) { // eslint-disable-line no-empty
                }
            }

            set(config, propPath, propValue);
        }

        const conf = process.env.LUSTER_CONF;

        let lastSeparator = -1,
            i = 0,
            openQuote = false;

        while (conf.length > i++) {
            switch (conf[i]) {
            case '"' :
                openQuote = !openQuote;
                break;
            case ';' :
                if (!openQuote) {
                    parseProp(conf.substring(lastSeparator + 1, i));
                    lastSeparator = i;
                }
            }
        }

        if (lastSeparator < conf.length) {
            parseProp(conf.substring(lastSeparator + 1));
        }
    }
}

Configuration.check = require('./check');

module.exports = Configuration;
