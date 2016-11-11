var legacy = require('./legacy'),
    LusterRPCCallbackError = require('./errors').LusterRPCCallbackError;

var RPCCallback = {
    _storage : {},

    _counter : 0,

    /**
     * @param {Number} wid templar-specific process id
     * @param {String} command
     * @param {Function} callback
     * @param {Number} [timeout=10000] in milliseconds
     * @returns {String} callbackId
     */
    setCallback : function(wid, command, callback, timeout) {
        var self = this,
            storage = self._storage;

        if ( ! timeout) {
            timeout = 10000;
        }

        var callbackId = wid + '_' + self._counter++;

        storage[callbackId] = {
            callback : callback,
            timeout :
                setTimeout(function() {
                    storage[callbackId].callback(
                        LusterRPCCallbackError.createError(
                            LusterRPCCallbackError.CODES.REMOTE_CALL_WITH_CALLBACK_TIMEOUT,
                            { command : command }));
                    self.removeCallback(callbackId);
                }, timeout)
        };

        return callbackId;
    },

    /**
     * @param {ClusterProcess} proc
     * @param {String} callbackId
     */
    processCallback : function(proc, callbackId) {
        var stored = this._storage[callbackId];

        if ( ! stored) {
            return;
        }

        legacy.setImmediate(stored.callback);
        this.removeCallback(callbackId);
    },

    /**
     * @param {String} callbackId
     */
    removeCallback : function(callbackId) {
        var timeout = this._storage[callbackId].timeout;

        clearTimeout(timeout);
        delete this._storage[callbackId];
    }
};

module.exports = RPCCallback;
