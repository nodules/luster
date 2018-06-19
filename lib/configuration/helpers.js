const util = require('util'),
    LusterConfigurationError = require('../errors').LusterConfigurationError;

/**
 * @param {*} value
 * @returns {String} `typeof` result extended with 'array', 'regexp', 'date' and 'error'
 */
function typeOf(value) {
    let type = typeof value;

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
    let ctx = context;

    const props = path.split('.'),
        target = props.pop(),
        size = props.length;

    for (let i = 0; i < size; i++) {
        const propName = props[i];
        const type = typeOf(ctx[propName]);

        if (type === 'undefined') {
            ctx[propName] = {};
        } else if (type !== 'object') {
            throw LusterConfigurationError.createError(
                LusterConfigurationError.CODES.CAN_NOT_SET_ATOMIC_PROPERTY_FIELD,
                { path: props.slice(0, size).join('.') });
        }

        ctx = ctx[propName];
    }

    delete ctx[target];
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

    const props = path.split('.'),
        size = props.length;

    let ctx = context;

    for (let i = 0, prop = props[0]; i < size; prop = props[++i]) {
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

    const props = path.split('.'),
        size = props.length;

    let ctx = context;

    for (let i = 0, prop = props[0]; i < size; prop = props[++i]) {
        if (typeof ctx === 'undefined' || ctx === null ||
            ! Object.prototype.hasOwnProperty.call(ctx, prop)) {
            return false;
        }

        ctx = ctx[prop];
    }

    return true;
}

module.exports = {
    typeOf,
    has,
    get,
    set,
};
