const proc = require('luster');

proc
    .configure({
        app: 'worker.js',
        workers: 2,
        control: {
            stopTimeout: 100,
            triggerReadyStateManually: true,
        }
    }, true, __dirname)
    .run();

if (proc.isMaster) {
    proc.once('running', () => process.send('ready'));
}
