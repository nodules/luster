const worker = require('luster');

function hang() {
    while (true) {} // eslint-disable-line
}

worker.registerRemoteCommand('hang', hang);

worker.registerRemoteCommand('disconnect and hang', () => {
    // Imitate situation when worker disconnects and cannot quit.
    // Master should kill such a worker after `stopTimeout`.
    process.removeAllListeners('disconnect');
    process.once('disconnect', hang);
    process.disconnect();
});

worker.registerRemoteCommandWithCallback('request', callback => callback('response'));
