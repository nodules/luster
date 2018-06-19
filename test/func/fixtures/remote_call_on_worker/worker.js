const worker = require('luster');

worker.once('ready', () => {
    worker.remoteCallWithCallback({
        command: 'test',
        callback: (worker, error, response) => {
            console.log(response);
            worker.remoteCall('test 2', '4');
        },
        data: '3',
    });
});
