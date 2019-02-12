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
    proc.on('shutdown', () => console.log('shutdown'));
    proc.on('shutdown', () => process.connected && process.disconnect());

    process.on('message', command => {
        switch (command) {
        case 'shutdown':
            proc.shutdown();
            break;
        default:
            throw new Error('Unknown command ' + command);
        }
    });
}
