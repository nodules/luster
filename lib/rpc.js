/**
 * @type {{createCaller: Function, parseMessage: Function}}
 */
var RPC = {
    /**
     * @param {Object} target must have `send` method
     * @returns {Function} (String name, ...args)
     */
    createCaller : function(target) {
        return function(name) {
            var message = { cmd : 'luster_' + name };

            if (arguments.length > 1) {
                message.args = Array.prototype.slice.call(arguments, 1);
            }

            target.send(message);
        };
    },

    /**
     * @typedef IPCMessage
     * @property {String} cmd Command name, starts with the prefix 'luster_'
     * @property {Array} [args] Command arguments
     */

    /**
     * @param {*} message
     * @returns IPCMessage|null IPCMessage if `message` is valid luster IPC message, null – while not
     */
    parseMessage : function(message) {
        if (message &&
            typeof message.cmd === 'string' &&
            message.cmd.indexOf('luster_') === 0) {

            return /** @type IPCMessage */{
                cmd : message.cmd.substr(7),
                args : message.args
            };
        } else {
            return null;
        }
    }
};

module.exports = RPC;