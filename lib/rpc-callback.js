const LusterRPCCallbackError = require('./errors').LusterRPCCallbackError;

const RPCCallback = {
    _storage: {},

    _counter: 0,

    /**
     * @param {ClusterProcess} proc
     * @param {String} command
     * @param {Function} callback
     * @param {Number} [timeout=10000] in milliseconds
     * @returns {String} callbackId
     */
    setCallback: function(proc, command, callback, timeout) {
        const storage = this._storage;

        if ( ! timeout) {
            timeout = 10000;
        }

        const callbackId = proc.wid + '_' + this._counter++;

        storage[callbackId] = {
            callback: callback,
            timeout:
                setTimeout(() => {
                    storage[callbackId].callback(
                        proc,
                        LusterRPCCallbackError.createError(
                            LusterRPCCallbackError.CODES.REMOTE_CALL_WITH_CALLBACK_TIMEOUT,
                            { command: command }));
                    this.removeCallback(callbackId);
                }, timeout)
        };

        return callbackId;
    },

    /**
     * @param {ClusterProcess} proc
     * @param {String} callbackId
     * @param {*} [data] provided in callback
     */
    processCallback: function(proc, callbackId, data) {
        const stored = this._storage[callbackId];

        if ( ! stored) {
            return;
        }

        setImmediate(() => stored.callback(proc, null, data));
        this.removeCallback(callbackId);
    },

    /**
     * @param {String} callbackId
     */
    removeCallback: function(callbackId) {
        const timeout = this._storage[callbackId].timeout;

        clearTimeout(timeout);
        delete this._storage[callbackId];
    }
};

module.exports = RPCCallback;
