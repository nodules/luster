var proc = require('luster');

proc
    .configure({
        app: 'worker.js',
        workers: 1,
        control: {
            stopTimeout: 100
        }
    }, true, __dirname)
    .run();

if (proc.isMaster) {
    proc.once('running', function() {
        process.send('ready');
        var worker = proc.getWorkersArray()[0];
        worker.remoteCallWithCallback({
            command: 'test',
            callback: function (worker, error, response) {
                console.log(response);
                worker.remoteCall('test 2', '2');
            },
            data: '1',
        });
    });
}
