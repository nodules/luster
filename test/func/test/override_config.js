/* globals describe,it,before,after */
'use strict';

const LusterInstance = require('../helpers/luster_instance');

describe('LUSTER_CONF env variable', () => {
    let instance;

    beforeEach(() => {
        return LusterInstance
            .run('../fixtures/override_config/master.js', {LUSTER_CONF: 'test=good'})
            .then(inst => instance = inst);
    });

    it('should override config', () => {
        return instance.waitAnswer('master - good')
            .then(() => instance.waitAnswer('worker - good'));
    });

    afterEach(() => {
        if (instance) {
            instance.kill();
            instance = null;
        }
    });
});
