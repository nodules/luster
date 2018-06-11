/* globals describe,it,before,after */
'use strict';

const LusterInstance = require('../helpers/luster_instance');

describe('stopTimeout', () => {
    let instance;

    beforeEach(() => {
        return LusterInstance
            .run('../fixtures/force_kill/master.js')
            .then(inst => instance = inst);
    });

    it('should kill infinite worker', () =>
        instance.sendWaitTimeout('hang', 10)
            .then(() => instance.sendWaitAnswer('restart', 'restarted'))
            .then(() => instance.sendWaitAnswer('request', 'response'))
    );

    it('should kill infinite worker that disconnected itself', () =>
        instance.sendWaitAnswer('disconnect and hang', 'disconnected')
            .then(() => instance.sendWaitAnswer('wait worker', 'worker ready'))
            .then(() => instance.sendWaitAnswer('request', 'response'))
    );

    afterEach(() => {
        if (instance) {
            instance.kill();
            instance = null;
        }
    });
});
