const proc = require('luster');

proc
    .configure({
        app: 'worker.js',
        workers: 1,
        control: {
            stopTimeout: 100,
            exitThreshold: 50,
            allowedSequentialDeaths: 0,
        }
    }, true, __dirname)
    .run();

if (proc.isMaster) {
    proc.once('running', () => {
        process.send('ready');
    });

    proc.on('worker exit', worker => {
        console.log(`Worker ${worker.wid} has exited, dead is ${worker.dead}`);
    });

    process.on('message', message => {
        switch (message) {
        case 'worker quit':
            proc.emitToAll('quit');
            break;
        case 'worker restart':
            proc.forEach(worker => worker.restart());
            break;
        case 'worker stop':
            proc.forEach(worker => worker.stop());
            break;
        default:
            throw new Error(`Got unknown command ${message}`);
        }
    });
}
