const LusterConfigurationError = require('../errors').LusterConfigurationError,
    typeOf = require('./helpers').typeOf,
    get = require('./helpers').get;

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
const CHECKS = {
    // path to worker main module
    'app': { required: true, type: 'string' },
    // number of workers to spawn
    'workers': { type: 'number' },

    // time (in ms) to wait for `online` event from worker
    'control.forkTimeout': { type: 'number' },
    // time (in ms) to wait for `exit` event from worker after `disconnect` before sending SIGTERM
    'control.stopTimeout': { type: 'number' },
    // time (in ms) to wait for `exit` event from worker after `disconnect` before sending SIGKILL
    'control.killTimeout': { type: 'number' },
    // if worker dies in `threshold` ms then it's restarts counter increased
    'control.exitThreshold': { type: 'number' },
    // allowed restarts before mark worker as dead
    'control.allowedSequentialDeaths': { type: 'number' },

    // initial port for workers
    'server.port': { type: ['number', 'string'] },
    // increase port for every group
    'server.groups': { type: 'number' },
    // number of ports for each group
    'server.portsPerGroup': { type: 'number' },
    // hash of extensions; keys – modules' names, values – extensions' configs
    'extensions': { type: 'object' },
    // path to node_modules directory which contains extensions
    // configuration directory used by default
    'extensionsPath': { type: 'string' },
    // time to wait for configuration of all extensions
    'extensionsLoadTimeout': { type: 'number' }
};

/**
 * @param {String} path to property
 * @param {*} value
 * @param {PropertyCheck} check value description
 * @throws {LusterConfigurationError} if property check has been failed
 */
function checkProperty(path, value, check) {
    const type = typeOf(value);

    // required property
    if (type === 'undefined') {
        if (check.required) {
            throw LusterConfigurationError.createError(
                LusterConfigurationError.CODES.PROP_REQUIRED,
                { property: path });
        } else {
            return;
        }
    }

    // allowed types
    const allowedTypes = check.type && [].concat(check.type);
    if (allowedTypes && allowedTypes.indexOf(type) === -1) {
        throw LusterConfigurationError.createError(
            LusterConfigurationError.CODES.PROP_TYPE_CHECK_FAILED,
            {
                property: path,
                type,
                expected: allowedTypes.join(' or ')
            });
    }
}

/**
 * Validate configuration object using descriptions from CHECKS const
 * @param {Object} conf configuration object
 * @returns {Number} of failed checks
 */
function checkConfiguration(conf) {
    let failedChecks = 0;

    for (const path of Object.keys(CHECKS)) {
        // @todo avoid try..catch
        try {
            checkProperty(path, get(conf, path), CHECKS[path]);
        } catch (error) {
            LusterConfigurationError.ensureError(error).log();
            ++failedChecks;
        }
    }

    return failedChecks;
}

module.exports = checkConfiguration;
