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
 * beforeEach(function() {
 *        return LusterInstance
 *            .run('../fixtures/force_kill/master.js')
 *            .then(function (inst) {
 *                instance = inst;
 *            });
 *    });
 * afterEach(function() {
 *        instance.kill();
 *        instance = null;
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
 *                 proc.remoteCallToAllWithCallback({
 *                     command: 'request',
 *                     callback: function(worker, something, response) {
 *                         process.send(response);
 *                     }});
 *                 break;
 *         }
 *     });
 * }
 */

const fork = require('child_process').fork,
    path = require('path');

/**
 * A wrapper for `ChildProcess`
 * @class LusterInstance
 * @param {ChildProcess} child
 * @param {boolean} [pipeStderr] - whether instance's stderr should be piped to current process stderr
 * @constructor
 */
class LusterInstance {
    constructor(child, pipeStderr) {
        if (pipeStderr === undefined) {
            pipeStderr = true;
        }

        this._process = child;
        this._output = '';
        const that = this;
        this._process.stdout.on('data', chunk => {
            that._output += chunk.toString('utf8');
        });
        if (pipeStderr) {
            this._process.stderr.pipe(process.stderr, {end: false});
        }
    }

    /**
     * Creates new LusterInstance with master at `name` and waits for master 'ready' message.
     * @param {String} name - absolute path or path relative to `luster_instance` module.
     * @param {Object} [env] - environment key-value pairs
     * @param {boolean} [pipeStderr]
     * @returns {Promise}
     */
    static run(name, env, pipeStderr) {
        if (typeof(env) === 'boolean') {
            pipeStderr = env;
        }
        const instance = fork(path.resolve(__dirname, name), {env, silent: true});
        const res = new LusterInstance(instance, pipeStderr);

        // Promise is resolved when master process replies to ping
        // Promise is rejected if master was unable to reply to ping within 1 second
        return new Promise((resolve, reject) => {
            instance.once('message', message => {
                if (message === 'ready') {
                    resolve(res);
                } else {
                    reject(new Error('First message from master should be "ready", got "' + message + '" instead'));
                }
            });
        });
    }

    /**
     * Sends message to master instance, resolves after timeout
     * @param {String} message
     * @param {Number} timeout
     * @returns {Promise}
     */
    sendWaitTimeout(message, timeout) {
        const self = this;
        return new Promise(resolve => {
            self._process.send(message);
            setTimeout(resolve, timeout);
        });
    }

    /**
     * Sends message to master instance, waits for first message from master instance.
     * Resolves if received message is expected answer and rejects otherwise.
     * @param {String} message
     * @param {String} expectedAnswer
     * @returns {Promise}
     */
    sendWaitAnswer(message, expectedAnswer) {
        const self = this;
        return new Promise((resolve, reject) => {
            self._process.send(message);
            self._process.once('message', answer => {
                if (answer === expectedAnswer) {
                    resolve();
                } else {
                    reject('Expected master to send "' + expectedAnswer + '", got "' + answer + '" instead');
                }
            });
        });
    }

    /**
     * Waits for message from master instance.
     * Resolves if received message is expected answer and rejects otherwise.
     * @param {String} expectedAnswer
     * @returns {Promise}
     */
    waitAnswer(expectedAnswer) {
        const self = this;
        return new Promise((resolve, reject) => {
            self._process.once('message', answer => {
                if (answer === expectedAnswer) {
                    resolve();
                } else {
                    reject('Expected master to send "' + expectedAnswer + '", got "' + answer + '" instead');
                }
            });
        });
    }

    /**
     * Returns all of the spawned processes output (stdout only) from their start
     * @returns {String}
     */
    output() {
        return this._output;
    }

    /**
     * Kills underlying master process
     */
    kill() {
        this._process.kill();
    }
}

module.exports = LusterInstance;
