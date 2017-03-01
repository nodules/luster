var worker = require('luster');

worker.registerRemoteCommandWithCallback('test', function(callback) {
    callback(worker.config.get('test'));
});
