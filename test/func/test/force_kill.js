/* globals describe,it,before,after */
'use strict';

var LusterInstance = require('../helpers/luster_instance');

describe('stopTimeout', function() {
    var instance;

    before(function() {
        return LusterInstance
            .run('../fixtures/force_kill/master.js')
            .then(function (inst) {
                instance = inst;
            });
    });

    it('should kill infinite worker', function() {
        return instance.sendWaitTimeout('hang', 10)
            .then(function() { return instance.sendWaitAnswer('restart', 'restarted'); })
            .then(function() { return instance.sendWaitAnswer('request', 'response'); });
    });

    it('should kill infinite worker that disconnected itself', function() {
        return instance.sendWaitAnswer('disconnect and hang', 'disconnected')
            .then(function() { return instance.sendWaitAnswer('wait worker', 'worker ready'); })
            .then(function() { return instance.sendWaitAnswer('request', 'response'); });
    });

    after(function() {
        if (instance) {
            instance.kill();
            instance = null;
        }
    });
});
