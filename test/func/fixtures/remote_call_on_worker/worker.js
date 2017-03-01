var worker = require('luster');

worker.once('ready', function() {
    worker.remoteCallWithCallback({
        command: 'test',
        callback: function (worker, error, response) {
            console.log(response);
            worker.remoteCall('test 2', '4');
        },
        data: '3',
    });
});
