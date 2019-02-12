const Terror = require('terror'),
    errors = {};

/**
 * @constructor
 * @class LusterError
 * @augments Terror
 */
const LusterError = errors.LusterError = Terror.create('LusterError',
    {
        ABSTRACT_METHOD_IS_NOT_IMPLEMENTED:
            'Abstract method "%method%" is not implemented in the %klass%'
    });

/**
 * @constructor
 * @class LusterWorkerError
 * @augments LusterError
 */
errors.LusterWorkerError = LusterError.create('LusterWorkerError',
    {
        ALREADY_READY:
            'Worker#ready() called when worker is is "ready" state already'
    });

/**
 * @constructor
 * @class LusterConfigurationError
 * @augments LusterError
 */
errors.LusterConfigurationError = LusterError.create('LusterConfigurationError',
    {
        CONFIGURATION_CHECK_FAILED:
            'Configuration check failed',
        PROP_REQUIRED:
            'Required property "%property%" is absent',
        PROP_TYPE_CHECK_FAILED:
            'Property "%property%" type is "%type%", but %expected% is expected',
        PROP_REGEXP_CHECK_FAILED:
            'Property "%property%" doesn\'t meet the regexp "%regexp%"',
        CAN_NOT_SET_ATOMIC_PROPERTY_FIELD:
            'Property "%path%" already exists and is not an object'
    });

/**
 * @constructor
 * @class LusterConfigurationError
 * @augments LusterError
 */
errors.LusterWorkerWrapperError = LusterError.create('LusterWorkerWrapperError',
    {
        INVALID_ATTEMPT_TO_CHANGE_STATE:
            'Invalid attempt to change worker #%wid% (pid: %pid%) state from "%state%" to "%targetState%"',
        REMOTE_COMMAND_CALL_TO_STOPPED_WORKER:
            'Remote command call "%command%" to stopped worker #%wid%'
    });

/**
 * @constructor
 * @class LusterClusterProcessError
 * @augments LusterError
 */
errors.LusterClusterProcessError = LusterError.create('LusterClusterProcessError',
    {
        REMOTE_COMMAND_ALREADY_REGISTERED:
            'Command "%name%" already registered as allowed for remote calls',
        REMOTE_COMMAND_IS_NOT_REGISTERED:
            'Remote command "%name%" is not registered on %klass%',
        EXTENSIONS_LOAD_TIMEOUT:
            'Extensions %timeouted% not loaded in %timeout% ms'
    });

/**
 * @constructor
 * @class LusterRPCCallbackError
 * @augments LusterError
 */
errors.LusterRPCCallbackError = LusterError.create('LusterRPCCallbackError',
    {
        REMOTE_CALL_WITH_CALLBACK_TIMEOUT:
            'Remote call failed due to timeout for command "%command%"'
    });

/**
 * @constructor
 * @class LusterPortError
 * @augments LusterError
 */
errors.LusterPortError = LusterError.create('LusterPortError',
    {
        NOT_UNIX_SOCKET:
            '"%value%" is not a unix socket',
        CAN_NOT_UNLINK_UNIX_SOCKET:
            'Can not unlink unix socket "%socketPath%"'
    });

/**
 * @constructor
 * @class LusterMasterError
 * @augments LusterError
 */
errors.LusterMasterError = LusterError.create('LusterMasterError',
    {
        POOL_KEY_ALREADY_TAKEN:
            'Pool key "%key%" is already taken'
    });

/**
 * @constructor
 * @class LusterMasterError
 * @augments LusterError
 */
errors.LusterMasterError = LusterError.create('LusterMasterError',
    {
        POOL_DOES_NOT_EXIST:
            'Pool with key "%key%" does not exist'
    });

module.exports = errors;
