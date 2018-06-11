const worker = require('luster');
setTimeout(() => {
    console.log('run', worker.wid);
    worker.ready();
}, 10);

// Do not let worker quit
setTimeout(() => {}, 10000000000);
