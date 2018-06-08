const proc = require('luster');

proc
    .configure({
        app: 'worker.js',
        workers: 1,
        control: {
            exitThreshold: 100,
        },
        extensions: {
            'luster-simple': {
                param1: 1,
                param2: 'World'
            },
        }
    }, true, __dirname)
    .run();

if (proc.isMaster) {
    proc.once('running', function() {
        process.send('ready');
    });
}
