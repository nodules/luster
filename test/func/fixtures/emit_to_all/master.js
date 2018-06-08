const proc = require('luster');

proc
    .configure({
        app: 'worker.js',
        workers: 2,
        control: {
            stopTimeout: 100
        }
    }, true, __dirname)
    .run();

if (proc.isMaster) {
    proc.once('running', function() {
        process.send('ready');
        proc.emitToAll('log', 'test');
    });
}
