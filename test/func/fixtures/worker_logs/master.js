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
        setTimeout(function() {
            proc.restart();
        });
    });
    proc.once('restarted', function() {
        process.send('ready');
    });
}
