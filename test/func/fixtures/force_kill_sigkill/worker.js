const worker = require('luster');

process.on('SIGTERM', () => {
    console.log('SIGTERM received, ignoring...');
    // Не вызываем process.exit() - процесс продолжает работать
});

function hang() {
    console.log('hang');

    // exit endless loop after a five seconds, check time within it
    // otherwise they will live forever on local dev environment consuming a lot of CPU
    const start = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
        if (Date.now() - start > 3000) {
            break;
        }
    }
}

worker.registerRemoteCommand('hang', () => {
    console.log('remote command hang');
    hang();
});

worker.registerRemoteCommand('disconnect and hang', () => {
    // Imitate situation when worker disconnects and cannot quit.
    // Master should kill such a worker after `stopTimeout`.
    process.removeAllListeners('disconnect');
    process.once('disconnect', hang);
    process.disconnect();
});

worker.registerRemoteCommandWithCallback('request', callback => callback('response'));

