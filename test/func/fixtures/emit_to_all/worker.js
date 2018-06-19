const worker = require('luster');

worker.on('master log', data => console.log(data));
