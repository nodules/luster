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
    });
    process.on('message', function(message) {
        switch (message) {
        case 'hang':
            proc.remoteCallToAll('hang');
            break;
        case 'disconnect and hang':
            proc.remoteCallToAll('disconnect and hang');
            proc.once('worker disconnect', function() {
                process.send('disconnected');
            });
            break;
        case 'wait worker':
            proc.once('worker ready', function() {
                process.send('worker ready');
            });
            break;
        case 'request':
            proc.remoteCallToAllWithCallback({
                command: 'request',
                callback: function(worker, something, response) {
                    process.send(response);
                }
            });
            break;
        case 'restart':
            proc.restart();
            proc.once('restarted', function() {
                process.send('restarted');
            });
            break;
        }
    });
}
