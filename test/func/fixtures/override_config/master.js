const proc = require('luster');

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
    proc.once('running', () => {
        process.send('ready');
        setTimeout(() => {
            process.send('master - ' + proc.config.get('test'));
        }, 100);
        setTimeout(() => {
            proc.remoteCallToAllWithCallback({
                command: 'test',
                callback: (worker, error, text) => process.send('worker - ' + text),
            });
        }, 200);
    });
}
