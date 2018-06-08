const fs = require('fs'),
    LusterPortError = require('./errors').LusterPortError,
    UNIX_SOCKET_MASK = '*';

/**
 * @param {String|Number} value
 * @returns {Boolean}
 * @private
 */
function isUnixSocket(value) {
    return isNaN(value);
}

/**
 * @constructor
 * @class Port
 * @param {String|Number} value
 */
class Port {
    constructor(value) {
        this.value = value;
    }

    /**
     * @memberOf {Port}
     * @property {String} family
     * @public
     * @readonly
     */
    get family() {
        return isUnixSocket(this.value) ? Port.UNIX : Port.INET;
    }

    /**
     * @param {*} port
     * @returns {Boolean}
     * @public
     */
    isEqualTo(port) {
        if (!(port instanceof Port)) {
            return false;
        }

        return this.value === port.value;
    }

    /**
     * @param {Number|String} [it=1]
     * @returns {Port}
     * @public
     */
    next(it) {
        if (typeof it === 'undefined') {
            it = 1;
        }

        const newVal = this.family === Port.UNIX ?
            this.value.replace(UNIX_SOCKET_MASK, it.toString()) :
            Number(this.value) + it;

        return new Port(newVal);
    }

    /**
     * @param {Error} [err]
     * @param {Function} cb
     */
    unlink(err, cb) {
        if (!cb && typeof err === 'function') {
            cb = err;
            err = undefined;
        }

        if (err) {
            cb(LusterPortError
                .createError(LusterPortError.CODES.UNKNOWN_ERROR, err));
            return;
        }

        const value = this.value;

        if (this.family !== Port.UNIX) {
            cb(LusterPortError
                .createError(LusterPortError.CODES.NOT_UNIX_SOCKET)
                .bind({value: value}));
            return;
        }

        fs.unlink(value, function(err) {
            if (err && err.code !== 'ENOENT') {
                cb(LusterPortError
                    .createError(LusterPortError.CODES.CAN_NOT_UNLINK_UNIX_SOCKET, err)
                    .bind({socketPath: value}));
                return;
            }

            cb();
        });
    }

    toString() {
        return this.value;
    }

    valueOf() {
        return this.value;
    }
}

/**
 * @property {String} UNIX
 * @memberOf {Port}
 * @readonly
 */

/**
 * @property {String} INET
 * @memberOf {Port}
 * @readonly
 */
['UNIX', 'INET'].forEach(function(family) {
    Object.defineProperty(Port, family, {
        value: family.toLowerCase(),
        enumerable: true
    });
});

module.exports = Port;
