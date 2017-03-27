var worker = require('luster');
setTimeout(function() {
    console.log('run', worker.wid);
    worker.ready();
}, 10);

// Do not let worker quit
setTimeout(function() {}, 10000000000);
