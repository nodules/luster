/**
 * @type {{createCaller: Function, parseMessage: Function}}
 */
const RPC = {
    /**
     * @param {Object} target must have `send` method
     * @returns {Function} (String name, ...args)
     */
    createCaller(target) {
        return function(name, ...args) {
            const message = { cmd: 'luster_' + name };

            if (args.length > 0) {
                message.args = args;
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
    parseMessage(message) {
        if (message &&
            typeof message.cmd === 'string' &&
            message.cmd.indexOf('luster_') === 0) {

            return /** @type IPCMessage */{
                cmd: message.cmd.substr(7),
                args: message.args
            };
        } else {
            return null;
        }
    },

    /**
     * Core remote functions dictionaries
     */
    fns: {
        worker: {
            broadcastMasterEvent: 'core.worker.broadcastMasterEvent',
            applyForeignProperties: 'core.worker.applyForeignProperties'
        },
        master: {
            broadcastWorkerEvent: 'core.master.broadcastWorkerEvent'
        },
        callback: 'core.callback'
    }
};

module.exports = RPC;
