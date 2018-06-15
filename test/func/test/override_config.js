/* globals describe,it,before,after */
'use strict';

const LusterInstance = require('../helpers/luster_instance');

describe('LUSTER_CONF env variable', function() {
    let instance;

    beforeEach(function() {
        return LusterInstance
            .run('../fixtures/override_config/master.js', { LUSTER_CONF: 'test=good' } )
            .then(function (inst) {
                instance = inst;
            });
    });

    it('should override config', function() {
        return instance.waitAnswer('master - good')
            .then(function() { return instance.waitAnswer('worker - good'); } );
    });

    afterEach(function() {
        if (instance) {
            instance.kill();
            instance = null;
        }
    });
});
