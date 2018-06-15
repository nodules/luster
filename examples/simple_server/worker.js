const http = require('http'),
    worker = require('luster');

if (worker.wid === 1 || worker.wid === 0) {
    console.log('try to open http://localhost:%s', process.env.port);
}

http
    .createServer(function(req, res) {
        res.end('Worker #' + worker.wid + ' at your service, sir!');
    })
    .listen(process.env.port);
