var http = require('http'),
    worker = require('luster'),
    myWorkerData = 'No data for now :( Please visit my master.';

worker.on('master update-data', function(receivedData) {
    myWorkerData = receivedData;
});

http
    .createServer(function(req, res) {
        if (req.url !== '/') {
            res.statusCode = 404;
            return res.end();
        }
        res.end('myWorkerData: ' + myWorkerData);
    })
    .listen(process.env.port, function() {
        console.log('Worker #%s ready on http://localhost:%s', worker.id, process.env.port);
    });
