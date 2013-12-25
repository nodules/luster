var Objex = require('objex'),
    EventEmitter = require('events').EventEmitter,

    /**
     * @constructor
     * @class EventEmitterEx
     * @augments EventEmitter
     * @augments Objex
     */
    EventEmitterEx = Objex.wrap(EventEmitter).create();

// add 'luster:eex' to the `NODE_DEBUG` environment variable to enable events logging
if (process.env.NODE_DEBUG && /luster:eex/i.test(process.env.NODE_DEBUG)) {
    EventEmitterEx.prototype.emit = function() {
        var iid = this.wid || this.id;

        iid = typeof iid === 'undefined' ? '' : '(' + iid + ')';

        console.log('%s%s.emit(%s)', this.constructor.name || 'EventEmitterEx', iid, Array.prototype.join.call(arguments, ', '));

        return EventEmitterEx.__super.prototype.emit.apply(this, arguments);
    };
}

module.exports = EventEmitterEx;