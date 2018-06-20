/* globals describe,it,before,after */
'use strict';

const LusterInstance = require('../helpers/luster_instance');

describe('LUSTER_CONF env variable', () => {
    let instance;

    beforeEach(async () => {
        instance = await LusterInstance
            .run('../fixtures/override_config/master.js', {LUSTER_CONF: 'test=good'});
    });

    it('should override config', async () => {
        await instance.waitAnswer('master - good');
        await instance.waitAnswer('worker - good');
    });

    afterEach(() => {
        if (instance) {
            instance.kill();
            instance = null;
        }
    });
});
