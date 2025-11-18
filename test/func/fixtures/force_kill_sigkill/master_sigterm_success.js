const proc = require('luster');

proc
    .configure({
        app: 'worker_sigterm_success.js',
        workers: 1,
        control: {
            stopTimeout: 100,
            killTimeout: 500,
        }
    }, true, __dirname)
    .run();

if (proc.isMaster) {
    proc.once('running', () => {
        process.send('ready')
        const worker = proc.getWorkersArray()[0];
        worker.process.disconnect();
    });
}
