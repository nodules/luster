const cluster = require('cluster'),
    /** @type {ClusterProcess} */
    Proc = require(cluster.isMaster ? './master' : './worker');

module.exports = new Proc();
