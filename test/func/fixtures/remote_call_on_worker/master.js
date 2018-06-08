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
    proc.registerRemoteCommandWithCallback('test', function(callback, data) {
        callback(data);
    });

    proc.registerRemoteCommand('test 2', function(_worker, data) {
        console.log(data);
    });

    proc.once('running', function() {
        process.send('ready');
    });
}
