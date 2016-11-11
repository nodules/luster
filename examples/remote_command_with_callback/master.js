var http = require('http'),
    proc = require('luster'),
    MASTER_PORT = 8080;

proc
    .configure({
        app: 'worker.js',
        workers: 4,
        server: {
            port: MASTER_PORT + 1,
            groups: 4
        }
    }, true, __dirname)
    .run();

if (proc.isMaster) {
    proc.registerRemoteCommandWithCallback('log-version', function(callback, data) {
        setTimeout(function() {
            console.log('App version is %s', data);
            callback();
        }, 3000);
    });

    http
        .createServer(function(req, res) {
            if (req.url === '/update-data-on-first') {
                return proc.workers['1'].remoteCallWithCallback({
                    command: 'update-data',
                    callback: function(error) {
                        if (error) {
                            res.end(error.message + '\n');
                        } else {
                            res.end('Done updating worker#1!\n');
                        }
                    },
                    timeout: 5000,
                    data: 'Ut enim ad minim veniam'
                });
            }

            if (req.url === '/update-data-on-all') {
                var waitWorkers = proc.getWorkersArray().length;

                return proc.remoteCallToAllWithCallback({
                    command: 'update-data',
                    callback: function(error) {
                        waitWorkers--;

                        if (error) {
                            res.write(error.message + '\n');
                        } else {
                            res.write('Done updating worker!\n');
                        }

                        if ( ! waitWorkers) {
                            res.end();
                        }
                    },
                    timeout: 5000,
                    data: 'Lorem ipsum dolor sit amet'
                });
            }

            res.statusCode = 404;
            res.end('Url not found. Use: "/update-data-on-first" or "/update-data-on-all"');
        })
        .listen(MASTER_PORT, function() {
            console.log('Master ready on http://localhost:%s', MASTER_PORT);
        });
}
