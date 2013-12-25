var http = require('http'),
    cluster = require('cluster');

if (cluster.worker.id === 1) {
    console.log('try to open http://localhost:%s', process.env.port);
}

http
    .createServer(function(req, res) {
        res.end('Worker #' + cluster.worker.id + ' at your service, sir!');
    })
    .listen(process.env.port);
