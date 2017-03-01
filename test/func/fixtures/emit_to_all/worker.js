var worker = require('luster');

worker.on('master log', function(data) {
    console.log(data);
});
