var worker = require('luster');

worker.registerRemoteCommandWithCallback('test', function(callback, data) {
    callback(data);
});

worker.registerRemoteCommand('test 2', function(_worker, data) {
    console.log(data);
});
