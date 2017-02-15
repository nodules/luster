var http = require('http'),
    worker = require('luster'),
    my_worker_data = 'No data for now :( Please set it via my master.';

function getRandomInt(max, min) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

worker.registerRemoteCommandWithCallback('update-data', function(callback, data) {
    my_worker_data = data;
    setTimeout(function() {
        callback('Some test data to send back');
    }, getRandomInt(1, 5) * 1000);
});

http
    .createServer(function(req, res) {
        if (req.url === '/') {
            return res.end(my_worker_data + '\n');
        }

        if (req.url === '/log-version') {
            return worker.remoteCallWithCallback({
                command : 'log-version',
                callback : function(proc, error) {
                    if (error) {
                        return res.end(error.message + '\n');
                    }

                    res.end('Master logged app version to stdout!\n');
                },
                data : '1.0.0'
            });
        }

        res.statusCode = 404;
        res.end();
    })
    .listen(process.env.port, function() {
        console.log('Worker #%s ready on http://localhost:%s', worker.id, process.env.port);
    });
