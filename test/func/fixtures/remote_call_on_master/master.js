const proc = require('luster');

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
    proc.once('running', () => {
        process.send('ready');
        const worker = proc.getWorkersArray()[0];
        worker.remoteCallWithCallback({
            command: 'test',
            callback: (worker, error, response) => {
                console.log(response);
                worker.remoteCall('test 2', '2');
            },
            data: '1',
        });
    });
}
