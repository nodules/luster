const worker = require('luster');

worker.on('master quit', () => {
    process.disconnect();
});
