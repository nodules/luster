var http = require('http'),
    proc = require('luster'),
    MASTER_PORT = 8080,
    TEST_DATA = 'Lorem ipsum dolor sit amet';

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
    http
        .createServer(function(req, res) {
            if (req.url !== '/') {
                res.statusCode = 404;
                return res.end();
            }
            proc.emitToAll('update-data', TEST_DATA);
            res.end('Emitted new data ("' + TEST_DATA + '") to all workers');
        })
        .listen(MASTER_PORT, function() {
            console.log('Master ready on http://localhost:%s', MASTER_PORT);
        });
}
