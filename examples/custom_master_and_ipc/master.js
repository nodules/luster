/** @type {ClusterProcess} Master or Worker instance */
var proc = require('luster');

if (proc.isMaster) {
    // register command repeater in the master
    // if some worker call 'updateCounter' command,
    // master repeat it to another workers
    proc.registerRemoteCommand(
        'updateCounter',
        /**
         * Called by workers via IPC
         * @param {WorkerWrapper} sender
         * @param {*} value
         */
        function(sender, value) {
            proc.forEach(function(worker) {
                // repeat command to all workers except `sender`
                if (worker.id !== sender.id) {
                    // pass sender.wid to another workers know command source
                    worker.remoteCall('updateCounter', sender.id, value);
                };
            });
        });
}

proc
    .configure({
        app : 'worker.js',
        workers : 2,
        server : {
            port : 10080
        }
    }, true, __dirname)
    .run();
