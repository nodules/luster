var os = require('os'),
    tmpdirFn = os.tmpdir,
    setImmediateFn = global.setImmediate;

// node
if (typeof os.tmpdir !== 'function' && typeof os.tmpDir === 'function') {
    tmpdirFn = os.tmpDir;
}

if (typeof setImmediateFn !== 'function') {
    setImmediateFn = process.nextTick;
}

module.exports = {
    tmpdir : tmpdirFn,
    setImmediate : setImmediateFn
};
