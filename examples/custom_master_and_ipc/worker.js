const http = require('http'),
    worker = require('luster'),
    counters = {};

if (worker.id === 1) {
    console.log('try to open http://localhost:%s', process.env.port);
}

counters[worker.id] = 0;

worker.registerRemoteCommand(
    'updateCounter',
    (target, workerId, value) => {
        // update recieved counter
        counters[workerId] = value;
    });

http
    .createServer((req, res) => {
        res.end('Worker #' + worker.id + ' at your service, sir!\n\nCounters: ' + JSON.stringify(counters));

        // update counter in another workers
        worker.remoteCall('updateCounter', ++counters[worker.id]);
    })
    .listen(process.env.port);
