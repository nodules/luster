const worker = require('luster');

worker.registerRemoteCommandWithCallback('test', callback => callback(worker.config.get('test')));
