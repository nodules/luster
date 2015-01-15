Luster [![NPM version][npm-image]][npm-link]
======

[![Dependency status][deps-image]][deps-link]
[![Development Dependency status][devdeps-image]][devdeps-link]

## Core features

* No worker code modification is necessary.
* Provides common solution for master process.
* Maintains specified quantity of running workers.
* Allocates separate ports for debugging workers in the cluster.
* Runs groups of workers on the different ports for 3rd party load balancing (nginx or haproxy, for example).
* Allows configuration via JSON, JS or anything that can be `require`d out of the box.
* Zero downtime successive workers' restart.
* Simple and flexible API for building extensions and development of custom master-workers solutions.

## Quick start

Install `luster` module and save it as runtime dependency:

```console
$ npm install --save luster
```

Write minimal required configuration file for luster:

```console
$ echo '{ "app" : "worker.js" }' > ./luster.conf.json
```

Run the cluster:

```console
$ ./node_modules/.bin/luster
```

Read configuration manual to know more about luster features.

## Configuration

```javascript
module.exports = {
    // required, absolute or relative path to configuration file
    // of worker source file
    app : "./worker.js",

    // workers number
    // number of cpu threads is used by default
    workers : 4,

    // options to control workers startup and shutdown processes
    control : {
        // time to wait for 'online' event from worker
        // after spawning it (in milliseconds)
        forkTimeout : 3000,

        // time to wait for 'exit' event from worker
        // after disconnecting it (in milliseconds)
        stopTimeout : 10000,

        // if worker dies in `exitThreshold` time (in milliseconds) after start,
        // then its' `sequentialDeaths` counter will be increased
        exitThreshold : 5000,

        // max allowed value of `sequentialDeaths` counter
        // for each worker; on exceeding this limit worker will
        // be marked as `dead` and no more automatic restarts will follow.
        allowedSequentialDeaths : 10
    },

    // use "server" group if you want to use web workers
    server : {
        // initial port for the workers;
        // can be tcp port number or path to the unix socket;
        // if you use unix sockets with groups of the workers,
        // then path must contain '*' char, which will be replaced
        // with group number
        port : 8080,

        // number of workers' groups; each group will
        // have its own port number (port + group number)
        groups : 2
    },

    debug : {
        // debug port for first worker; each following will
        // use previous worker port + 1
        port : 5010
    },

    // extensions to load
    // each key in the "extensions" hash is a npm module name
    extensions : {
        // luster-log-file extension example
        "luster-log-file" : {
            stdout : "/var/log/luster/app.stdout.log",
            stderr : "/var/log/luster/app.stderr.log"
        },

        // luster-guard extension example
        "luster-guard" : {
            include: [ '**/*.js' ],
            exclude: [ '**/node_modules/**' ]
        }
    },

    // if extensions' modules can't be resolved as related to
    // luster module or worker path, then absolute path 
    // to the directory, which contains extensions modules 
    // must be declared here:
    extensionsPath : "/usr/local/luster-extensions",

    // max time to wait for extensions initialization
    extensionsLoadTimeout : 10000,

    // if your app or used extensions extensively use luster
    // internal events then you can tweak internal event emitters
    // listeners number limit using following option.
    // default value is `100`, option must be a number else EventEmitter
    // throws an error on configuration.
    maxEventListeners : 100
};
```

## Extensions

### [List of extensions](https://github.com/nodules/luster/wiki/Extensions)

### Extensions development

Extensions is a simple Node.js module, which must export object with `configure` function,
which will be called duering master and worker configuration.

> @todo

Synchronous extension initialization:
```javascript
module.exports = {
    configure : function(config, clusterProcess) {
        // has `get` method:
        // var someProp = config.get('some.property.path', defaultValue);
        this.config = config;

        if (clusterProcess.isMaster) {
            this.initializeOnMaster(clusterProcess);
        } else {
            this.initializeOnWorker(clusterProcess);
        }
    }
}
```

Asynchronous extension initalization:
```javascript
module.exports = {
    initializeOnMaster : function(master, done) {
        // emulate async operation
        setTimeout(function() {
            // do something
            done();
        }, 500);
    },

    initializeOnWorker : function(worker, done) {
        // emulate async operation
        setTimeout(function() {
            // do something
            done();
        }, 300);
    },

    configure : function(config, clusterProcess, done) {
        // has `get` method:
        // var someProp = config.get('some.property.path', defaultValue);
        this.config = config;

        if (clusterProcess.isMaster) {
            this.initializeOnMaster(clusterProcess, done);
        } else {
            this.initializeOnWorker(clusterProcess, done);
        }
    }
}
```

To enable asynchronous initalization of an extension, `configure` function must be declared with 3 or more arguments,
where 3-rd argument is callback, which must be called by extensions when initialization has been finished.
Callback accepts one optional argument: an error, if initalization failed.

[npm-image]: https://img.shields.io/npm/v/luster.svg?style=flat
[npm-link]: https://npmjs.org/package/luster
[deps-image]: https://img.shields.io/david/nodules/luster.svg?style=flat
[deps-link]: https://david-dm.org/nodules/luster
[devdeps-image]: https://img.shields.io/david/dev/nodules/luster.svg?style=flat
[devdeps-link]: https://david-dm.org/nodules/luster#info=devDependencies
