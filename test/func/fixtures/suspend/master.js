const proc = require('luster');
const pEvent = require('p-event');

proc
    .configure({
        app: 'worker.js',
        workers: 1,
        control: {
            stopTimeout: 1000
        }
    }, true, __dirname)
    .run();

if (proc.isMaster) {
    proc.once('running', () => process.send('ready'));
    proc.on('shutdown', () => {
        if (process.connected) {
            process.disconnect();
        }
    });
    process.on('message', message => {
        switch (message) {
        case 'register suspend 100':
            proc.remoteCallToAll('register suspend', 100);
            break;
        case 'register suspend 200':
            proc.remoteCallToAll('register suspend', 200);
            break;
        case 'register suspend 3000':
            proc.remoteCallToAll('register suspend', 3000);
            break;
        case 'soft-restart':
            pEvent(proc, 'restarted').then(() => process.send('restarted'));
            proc.softRestart();
            break;
        case 'shutdown':
            proc.shutdown();
            console.log('Shutting down');
            break;
        }
    });
}
