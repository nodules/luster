const worker = require('luster');

worker.registerRemoteCommandWithCallback('test', (callback, data) => callback(data));

worker.registerRemoteCommand('test 2', (_worker, data) => console.log(data));
