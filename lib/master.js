var os = require('os'),
    cluster = require('cluster'),
    extend = require('extend'),
    ClusterProcess = require('./cluster_process'),
    WorkerWrapper = require('./worker_wrapper'),
    Port = require('./port'),
    Master;

/**
 * @constructor
 * @class Master
 * @augments ClusterProcess
 */
Master = ClusterProcess.create(function Master() {
    Master.__super.apply(this, arguments);

    /**
     * @type {Object}
     * @property {WorkerWrapper} *
     * @public
     * @todo make it private or public immutable
     */
    this.workers = {};

    /**
     * Contains workers queued to restart.
     * @see Master#processRestartQueue
     * @type {WorkerWrapper[]}
     */
    this.restartQueue = [];

    /**
     * If `true` processing Master#restartQueue in progress.
     * @type {Boolean}
     * @private
     */
    this._isRestartQueued = false;

    /**
     * Configuration object to pass to cluster.setupMaster()
     * @type {Object}
     * @private
     */
    this._masterOpts = {};

    this.on('worker ready', this._onWorkerReady.bind(this));
    this.on('worker state', this._cleanupUnixSockets.bind(this));
    this.on('worker exit', this._checkWorkersAlive.bind(this));

    // @todo make it optional?
    process.on('SIGINT', this._onSignalQuit.bind(this));
    process.on('SIGQUIT', this._onSignalQuit.bind(this));
});

/**
 * Allows same object structure as cluster.setupMaster().
 * This function must be used instead of cluster.setupMaster(),
 * because all calls of cluster.setupMaster() ignored, except first one.
 * An instance of Master will call it, when running.
 * @param {Object} opts
 * @see {@link http://nodejs.org/api/cluster.html#cluster_cluster_setupmaster_settings}
 */
Master.prototype.setup = function(opts) {
    extend(this._masterOpts, opts);
};

/**
 * SIGINT and SIGQUIT handler
 * @private
 */
Master.prototype._onSignalQuit = function() {
    this
        .once('shutdown', function() {
            process.exit(0);
        })
        .shutdown();
};

/**
 * Remove not used unix socket before worker will try to listen it.
 * @param {WorkerWrapper} worker
 * @param {WorkerWrapperState} state
 * @private
 */
Master.prototype._cleanupUnixSockets = function(worker, state) {
    var port = worker.options.port;

    if (this._isRestartQueued ||
        state !== WorkerWrapper.STATES.LAUNCHING ||
        port.family !== Port.UNIX) {
        return;
    }

    var self = this,
        inUse = this.getWorkersArray().some(function(w) {
            return worker.wid !== w.wid &&
                w.isRunning() &&
                port.isEqualTo(w.options.port);
        });

    if ( ! inUse) {
        port.unlink(function(err) {
            if (err) {
                self.emit('error', err);
            }
        });
    }
};

/**
 * Check for alive workers, if no one here, then emit "shutdown".
 * @private
 */
Master.prototype._checkWorkersAlive = function() {
    var workers = this.getWorkersArray(),
        alive = workers.reduce(function(count, w) {
                return w.dead ? count - 1 : count;
            }, workers.length);

    if (alive === 0) {
        this.emit('shutdown');
    }
};

/**
 * @param {WorkerWrapper} worker
 * @private
 */
Master.prototype._onWorkerReady = function(worker) {
    // @todo what if one worker from queue die? Queue processing will be stopped...
    if (this._isRestartQueued &&
        worker.wid === this.restartQueue[0].wid) {
        // worker on top of the queue has been restarted drop it...
        this.restartQueue.shift();
        // ...and take the next or finish queue processing
        this._restartWorkerFromQueue();
    }
};

/**
 * Repeat WorkerWrapper events on Master and add 'worker ' prefix to event names
 * so for example 'online' became 'worker online'
 * @private
 * @param {WorkerWrapper} worker
 */
Master.prototype._proxyWorkerEvents = function(worker) {
    WorkerWrapper.EVENTS
        .forEach(function(eventName) {
            worker.on(eventName, this.emit.bind(this, 'worker ' + eventName, worker));
        }, this);
};

/**
 * @returns {WorkerWrapper[]} workers array
 */
Master.prototype.getWorkersArray = function() {
    if ( ! this._workersArrayCache) {
        this._workersArrayCache = Object.keys(this.workers).map(function(wid) {
            return this.workers[wid];
        }, this);
    }

    return this._workersArrayCache;
};

/**
 * Add worker to the pool
 * @param {WorkerWrapper} worker
 * @returns {Master} self
 * @public
 */
Master.prototype.add = function(worker) {
    // invalidate Master#getWorkersArray cache
    this._workersArrayCache = null;

    this.workers[worker.wid] = worker;
    this._proxyWorkerEvents(worker);

    return this;
};

/**
 * Iterate over workers in the pool.
 * @param {Function} fn
 * @public
 * @returns {Master} self
 *
 * @description Shortcut for:
 *      master.getWorkersArray().forEach(function(worker) {
 *          // fn
 *      }, master);
 */
Master.prototype.forEach = function(fn) {
    this.getWorkersArray().forEach(function(worker) {
        fn.call(this, worker);
    }, this);

    return this;
};

/**
 * Configure cluster
 * @override ClusterProcess
 * @private
 */
Master.prototype._onConfigured = function() {
    Master.__super.prototype._onConfigured.apply(this, arguments);

    var // WorkerWrapper options
        forkTimeout = this.config.get('control.forkTimeout'),
        stopTimeout = this.config.get('control.stopTimeout'),
        exitThreshold = this.config.get('control.exitThreshold'),
        allowedSequentialDeaths = this.config.get('control.allowedSequentialDeaths'),
        debugPort = this.config.get('debug.port'),

        // workers and groups count
        i = 0,
        count = this.config.get('workers', os.cpus().length),
        isServerPortSet = this.config.has('server.port'),
        port,
        groups = this.config.get('server.groups', 1),
        group = 0,
        workersPerGroup = Math.floor(count / groups),
        workersInGroup = 0;

    if (isServerPortSet) {
        port = new Port(this.config.get('server.port'));
    }

    // remove `--debug` option from passed to master
    this.setup({
        execArgv : process.execArgv.filter(function(s) {
            return ! /^\-\-debug/.test(s);
        })
    });

    // create pool of workers
    while (count > i++) {
        this.add(new WorkerWrapper(this, {
            forkTimeout : forkTimeout,
            stopTimeout : stopTimeout,
            exitThreshold : exitThreshold,
            allowedSequentialDeaths : allowedSequentialDeaths,
            debugPort : debugPort && debugPort + i - 1,
            port : isServerPortSet ? port.next(group) : 0,
            _maxListeners : this._maxListeners
        }));

        // groups > 1, current group is full and
        // last workers can form at least more one group
        if (groups > 1 &&
            ++workersInGroup >= workersPerGroup &&
            count - (group + 1) * workersPerGroup >= workersPerGroup) {
            workersInGroup = 0;
            group++;
        }
    }
};

/**
 * @param {Number[]} wids Array of `WorkerWrapper#wid` values
 * @param {String} event wait for
 * @param {Function} callback
 * @public
 * @returns {Master} self
 */
Master.prototype.waitForWorkers = function(wids, event, callback) {
    var self = this;

    function onWorkerState(worker) {
        var idx = wids.indexOf(worker.wid);

        if (idx > -1) {
            wids.splice(idx, 1);
        }

        if (wids.length === 0) {
            self.removeListener(event, onWorkerState);
            callback.call(self);
        }
    }

    this.on(event, onWorkerState);

    return this;
};

/**
 * @event Master#running
 */

/**
 * Fork workers.
 * Execution will be delayed until Master became configured
 * (`configured` event fired).
 * @method
 * @returns {Master} self
 * @public
 * @fires Master#running then workers spawned and ready.
 *
 * @example
 *      // file: master.js
 *      var master = require('luster');
 *
 *      master
 *          .configure({ app : 'worker' })
 *          .run();
 *
 *      // there is master is still not running anyway
 *      // it will run immediate once configured and
 *      // current thread execution done
 */
Master.prototype.run = Master.whenInitialized(function() {
    cluster.setupMaster(this._masterOpts);

    this.waitForWorkers(
        this.getWorkersArray().map(function(worker) {
            worker.run();

            return worker.wid;
        }),
        'worker ready',
        function() {
            this.emit('running');
        });

    return this;
});

/**
 * @event Master#restarted
 */

/**
 * Hard workers restart: all workers will be restarted at same time.
 * @public
 * @returns {Master} self
 * @fires Master#restarted then workers spawned and ready.
 */
Master.prototype.restart = function() {
    this.waitForWorkers(
        this.getWorkersArray().map(function(worker) {
            worker.restart();

            return worker.wid;
        }),
        'worker ready',
        function() {
            this.emit('restarted');
        });

    return this;
};

/**
 * Workers will be restarted one by one.
 * @public
 */
Master.prototype.softRestart = function() {
    this.forEach(function(worker) {
        this.restartQueue.push(worker);
    });

    this.restartQueue.push('restarted');

    this.processRestartQueue();
};

/**
 * Start processing restartQueue if it isn't started already.
 * @see event:Master#'worker state'('running')
 * @public
 */
Master.prototype.processRestartQueue = function() {
    if ( ! this._isRestartQueued) {
        this._isRestartQueued = true;
        this._restartWorkerFromQueue();
    }
};

/**
 * Restart worker from the top of the Master#restartQueue
 * @private
 */
Master.prototype._restartWorkerFromQueue = function() {
    while (typeof this.restartQueue[0] === 'string') {
        this.emit(this.restartQueue.shift());
    }

    if (this.restartQueue.length === 0) {
        this._isRestartQueued = false;
    } else {
        this.restartQueue[0].restart();
    }
};

/**
 * @override
 * @see ClusterProcess
 * @private
 */
Master.prototype._setupIPCMessagesHandler = function() {
    this.on('worker message', this._onMessage.bind(this));
};

/**
 * RPC to all workers
 * @method
 * @param {String} name of called command in the worker
 * @param {*} ...args
 * @public
 */
Master.prototype.remoteCallToAll = function(name) {
    /* jshint unused:false */
    var args = Array.prototype.slice.call(arguments, 0);

    this.forEach(function(worker) {
        if (worker.ready) {
            worker.remoteCall.apply(worker, args);
        } else {
            worker.on('ready', function(a) {
                worker.remoteCall.apply(worker, args);
            }.bind(worker, args))
        }
    });
};

/**
 * @event Master#shutdown
 */

/**
 * Stop all workers and emit `Master#shutdown` event after successful shutdown of all workers.
 * @fires Master#shutdown
 * @returns {Master}
 */
Master.prototype.shutdown = function() {
    var stoppedWorkers = [];

    this.forEach(function(worker) {
        if (worker.isRunning()) {
            worker.stop();
            stoppedWorkers.push(worker.wid);
        }
    });

    this.waitForWorkers(
        stoppedWorkers,
        'worker exit',
        function() {
            this.emit('shutdown');
        });

    return this;
};

module.exports = Master;
