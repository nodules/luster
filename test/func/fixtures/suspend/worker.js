const worker = require('luster');

worker.registerRemoteCommand('register suspend', (_, timeout) => {
    worker.registerSuspendFunction(() => {
        console.log(`Waiting ${timeout}ms in suspend function`);
        return new Promise(resolve => {
            setTimeout(() => {
                console.log(`Finished waiting ${timeout}ms in suspend function`);
                resolve();
            }, timeout);
        });
    });
});

worker.on('disconnect', () => {
    console.log('Got disconnect');
});

worker.on('ready', () => {
    console.log('Got ready');
});
