const util = require('util'),
    { EventEmitter } = require('events').EventEmitter;

/**
 * @constructor
 * @class EventEmitterEx
 * @augments EventEmitter
 */
class EventEmitterEx extends EventEmitter {}

function inspect(val) {
    return util.inspect(val, { depth: 1 }).replace(/^\s+/mg, ' ').replace(/\n/g, '');
}

// add 'luster:eex' to the `NODE_DEBUG` environment variable to enable events logging
if (process.env.NODE_DEBUG && /luster:eex/i.test(process.env.NODE_DEBUG)) {
    EventEmitterEx.prototype.emit = function() {
        const args = Array.prototype
            .slice.call(arguments, 0)
            .map(inspect);

        console.log('%s(%s).emit(%s)', this.constructor.name || 'EventEmitterEx', this.wid, args.join(', '));

        return EventEmitter.prototype.emit.apply(this, arguments);
    };
}

module.exports = EventEmitterEx;
