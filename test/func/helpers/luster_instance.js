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

const delay = require('delay');
const pEvent = require('p-event');

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
        this._process.stdout.setEncoding('utf8');
        this._process.stdout.on('data', chunk => {
            this._output += chunk;
        });
        if (pipeStderr) {
            this._process.stderr.pipe(process.stderr, {end: false});
        }

        this._exited = pEvent(this._process, 'exit');
    }

    /**
     * Creates new LusterInstance with master at `name` and waits for master 'ready' message.
     * @param {String} name - absolute path or path relative to `luster_instance` module.
     * @param {Object} [env] - environment key-value pairs
     * @param {boolean} [pipeStderr]
     * @returns {Promise}
     */
    static async run(name, env, pipeStderr) {
        if (typeof(env) === 'boolean') {
            pipeStderr = env;
        }
        const instance = fork(path.resolve(__dirname, name), {env, silent: true});
        const res = new LusterInstance(instance, pipeStderr);

        // Promise is resolved when master process replies to ping
        // Promise is rejected if master was unable to reply to ping within 1 second
        const message = await pEvent(instance, 'message');
        if (message === 'ready') {
            return res;
        } else {
            throw new Error('First message from master should be "ready", got "' + message + '" instead');
        }
    }

    get exited() {
        return this._exited;
    }

    send(message) {
        this._process.send(message);
    }

    /**
     * Sends message to master instance, resolves after timeout
     * @param {String} message
     * @param {Number} timeout
     * @returns {Promise}
     */
    async sendWaitTimeout(message, timeout) {
        this._process.send(message);
        await delay(timeout);
    }

    /**
     * Sends message to master instance, waits for first message from master instance.
     * Resolves if received message is expected answer and rejects otherwise.
     * @param {String} message
     * @param {String} expectedAnswer
     * @returns {Promise}
     */
    async sendWaitAnswer(message, expectedAnswer) {
        const p = pEvent(this._process, 'message');
        this._process.send(message);
        const answer = await p;
        if (answer !== expectedAnswer) {
            throw new Error('Expected master to send "' + expectedAnswer + '", got "' + answer + '" instead');
        }
    }

    /**
     * Waits for message from master instance.
     * Resolves if received message is expected answer and rejects otherwise.
     * @param {String} expectedAnswer
     * @returns {Promise}
     */
    async waitAnswer(expectedAnswer) {
        const answer = await pEvent(this._process, 'message');
        if (answer !== expectedAnswer) {
            throw new Error('Expected master to send "' + expectedAnswer + '", got "' + answer + '" instead');
        }
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
