var proc = require('luster'),
    WorkerWrapper = require('luster/lib/worker_wrapper');

proc
    .configure({
        app: 'worker.js',
        workers: 3,
        control: {
            exitThreshold: 10000,
            allowedSequentialDeaths: 0,
            triggerReadyStateManually: true,
        },
    }, true, __dirname)
    .run();

function restart() {
    console.log('restarting');
    proc.softRestart();
    proc.once('restarted', function() {
        process.send('restarted');
    });
}

function killFirstWorker() {
    var firstWorker = proc.getWorkersArray()[0];
    firstWorker.on('state', function(state) {
        // force dead state
        if (state === WorkerWrapper.STATES.LAUNCHING) {
            firstWorker.stop();
        }

        if (state === WorkerWrapper.STATES.STOPPED && firstWorker.dead) {
            console.log('dead', firstWorker.wid);
        }
    });
}

function killThirdWorker() {
    proc.getWorkersArray()[2].restart();
}

if (proc.isMaster) {
    proc.once('running', function() {
        process.send('ready');
    });

    proc.on('worker exit', function(worker) {
        console.log('exit', worker.wid);
    });

    process.on('message', function(command) {
        switch (command) {
        case 'restart':
            restart();
            break;
        case 'restartKillFirst':
            restart();
            killFirstWorker();
            break;
        case 'restartKillThird':
            restart();
            killThirdWorker();
            break;
        default:
            throw new Error('Unknown command ' + command);
        }
    });
}
