var http = require('http'),
    worker = require('luster'),
    my_worker_data = 'No data for now :( Please visit my master.';

worker.on('master update-data', function(received_data) {
    my_worker_data = received_data;
});

http
    .createServer(function(req, res) {
        if (req.url !== '/') {
            res.statusCode = 404;
            return res.end();
        }
        res.end('my_worker_data: ' + my_worker_data);
    })
    .listen(process.env.port, function() {
        console.log('Worker #%s ready on http://localhost:%s', worker.id, process.env.port);
    });
