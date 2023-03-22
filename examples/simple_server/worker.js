const http = require('http'),
    worker = require('luster');

console.log('Worker #%s: try to open http://localhost:%s', worker.wid, process.env.port);

http
    .createServer((req, res) => {
        res.end('Worker #' + worker.wid + ' at your service, sir!');
    })
    .listen(process.env.port);
