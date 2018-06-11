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
    proc.once('running', () => process.send('ready'));
    process.on('message', message => {
        switch (message) {
        case 'hang':
            proc.remoteCallToAll('hang');
            break;
        case 'disconnect and hang':
            proc.remoteCallToAll('disconnect and hang');
            proc.once('worker disconnect', () => process.send('disconnected'));
            break;
        case 'wait worker':
            proc.once('worker ready', () => process.send('worker ready'));
            break;
        case 'request':
            proc.remoteCallToAllWithCallback({
                command: 'request',
                callback: (worker, something, response) => process.send(response)
            });
            break;
        case 'restart':
            proc.restart();
            proc.once('restarted', () => process.send('restarted'));
            break;
        }
    });
}
