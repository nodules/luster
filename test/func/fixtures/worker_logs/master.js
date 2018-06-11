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
        setTimeout(() => proc.restart());
    });
    proc.once('restarted', () => process.send('ready'));
}
