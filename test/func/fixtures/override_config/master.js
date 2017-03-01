var proc = require('luster');

proc
    .configure({
        app: 'worker.js',
        workers: 1,
        test: 'bad',
        control: {
            stopTimeout: 100,
        }
    }, true, __dirname)
    .run();

if (proc.isMaster) {
    proc.once('running', function() {
        process.send('ready');
        setTimeout(function() {
            process.send('master - ' + proc.config.get('test'));
        }, 100);
        setTimeout(function() {
            proc.remoteCallToAllWithCallback({
                command: 'test',
                callback: function (worker, error, text) {
                    process.send('worker - ' + text);
                },
            });
        }, 200);
    });
}
