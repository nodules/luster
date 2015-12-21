var http = require('http'),
    worker = require('luster');

http
    .createServer(function(req, res) {
        res.end('Worker #' + worker.wid + ' at your service, sir!');
    })
    .listen(process.env.port, function() {
        setTimeout(function() {
            worker.ready();
            if (worker.wid === 1 || worker.wid === 0) {
                console.log('try to open http://localhost:%s', process.env.port);
            }
        }, 1000);
    });
