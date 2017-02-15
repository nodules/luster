/* globals Promise */
/**
 * @module test/func/runner
 *
 * A helper module to run test instances with luster. It runs master process which in turn should start luster with
 * needed configuration. Used in functional tests.
 * @example master process
 * var proc = require('luster');
 *
 * proc
 *   .configure({
 *       app: 'worker.js',
 *       workers: 1,
 *       control: {
 *           stopTimeout: 500
 *       }}, true, __dirname)
 *   .run();
 *
 * @example usage in test case
 * before(function() {
 *        return LusterInstance
 *            .run('../fixtures/force_kill/master.js')
 *            .then(function (inst) {
 *                instance = inst;
 *            });
 *    });
 *
 * Master should send 'ready' message once it has started:
 * @example
 * if (proc.isMaster) {
 *     proc.once('running', function() {
 *         process.send('ready');
 *     });
 * }
 *
 * Master can listen to IPC messages and reply to them if necessary. This is completely defined by your test case.
 * `LusterInstance` has methods `sendWaitTimeout` and `sendWaitAnswer` sending messages to master process and waiting
 * for timeout or reply:
 * @example
 * if (proc.isMaster) {
 *     process.on('message', function(message) {
 *         switch (message) {
 *             case 'hang':
 *                 // We do not reply to this message, so test will use `sendWaitTimeout` to call this
 *                 proc.remoteCallToAll('hang');
 *                 break;
 *             case 'request':
 *                 // We reply with some text, so test will use `sendWaitAnswer` to call this
 *                 proc.remoteCallToAllWithCallback({command: 'request', callback: function(worker, something, response) {
 *                     process.send(response);
 *                 }});
 *                 break;
 *         }
 *     });
 * }
 */

var fork = require('child_process').fork,
    path = require('path');

/**
 * A wrapper for `ChildProcess`
 * @class LusterInstance
 * @param {ChildProcess} process
 * @constructor
 */
function LusterInstance(process) {
    this._process = process;
}

/**
 * Creates new LusterInstance with master at `name` and waits for master 'ready' message.
 * @param {String} name - absolute path or path relative to `luster_instance` module.
 * @returns {Promise}
 */
LusterInstance.run = function(name) {
    var instance = fork(path.resolve(__dirname, name));

    // Promise is resolved when master process replies to ping
    // Promise is rejected if master was unable to reply to ping within 1 second
    return new Promise(function(resolve, reject) {
        var rejectTimeout = setTimeout(reject, 1000);
        instance.once('message', function(message) {
            clearTimeout(rejectTimeout);
            if (message === 'ready') {
                resolve(new LusterInstance(instance));
            } else {
                reject(new Error('First message from master should be "ready", got "' + message + '" instead'));
            }
        });
    });
};

/**
 * Sends message to master instance, resolves after timeout
 * @param {String} message
 * @param {Number} timeout
 * @returns {Promise}
 */
LusterInstance.prototype.sendWaitTimeout = function(message, timeout) {
    var self = this;
    return new Promise(function(resolve) {
        self._process.send(message);
        setTimeout(resolve, timeout);
    });
};

/**
 * Sends message to master instance, waits for first message from master instance.
 * Resolves if received message is expected answer and rejects otherwise.
 * @param {String} message
 * @param {String} expectedAnswer
 * @returns {Promise}
 */
LusterInstance.prototype.sendWaitAnswer = function(message, expectedAnswer) {
    var self = this;
    return new Promise(function(resolve, reject) {
        self._process.send(message);
        self._process.once('message', function(answer) {
            if (answer === expectedAnswer) {
                resolve();
            } else {
                reject('Expected master to send "' + expectedAnswer + '", got "' + answer + '" instead');
            }
        });
    });
};

/**
 * Kills underlying master process
 */
LusterInstance.prototype.kill = function() {
    this._process.kill();
};

module.exports = LusterInstance;
