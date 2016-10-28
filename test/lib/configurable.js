'use strict';
var Configurable = require('../../lib/configurable'),
    LusterConfigurationError = require('../../lib/errors').LusterConfigurationError,
    fixturesConf = require('../fixtures/luster.conf'),
    extend = require('extend');

// suppress stderr from terror
LusterConfigurationError.setLogger(function() {});

describe('Configurable', function() {
    var configurable,
        sandbox = sinon.sandbox.create();

    afterEach(function() {
        sandbox.restore();
    });

    describe('configure', function() {
        var config;

        beforeEach(function() {
            configurable = new Configurable();
            config = extend({}, fixturesConf, true);
            configurable.addListener('error', function() {});
        });

        afterEach(function() {
            configurable.removeAllListeners('error');
        });

        it('should emit "configured" event on configuration success', function() {
            sandbox.spy(configurable, 'emit');

            configurable.configure(config);

            assert.calledWith(configurable.emit, 'configured');
        });

        it('should emit "error" event for malformed config', function() {
            sandbox.spy(configurable, 'emit');

            configurable.configure({});

            assert.calledWith(configurable.emit, 'error');
        });

        describe('configuring via environment variable', function() {
            afterEach(function() {
                delete process.env.LUSTER_CONF;
            });

            it('should do simple one-level override', function() {
                process.env.LUSTER_CONF = 'workers=1';

                configurable.configure(config);

                assert.strictEqual(configurable.config.workers, 1);
            });

            it('should do nothing if overriding is explicitly turned off', function() {
                process.env.LUSTER_CONF = 'workers=1';

                configurable.configure(config, false);

                assert.strictEqual(configurable.config.workers, 10);
            });

            it('should override to undefined value via empty string', function() {
                process.env.LUSTER_CONF = 'foo=';

                configurable.configure(config);

                assert.isUndefined(configurable.config.foo);
            });

            it('should do nothing when only propname is provided', function() {
                process.env.LUSTER_CONF = 'foo';

                configurable.configure(config);

                assert.strictEqual(configurable.config.foo, true);
            });

            it('should emit error when trying to override non-string property with a string', function() {
                process.env.LUSTER_CONF = 'workers=some';
                sandbox.spy(configurable, 'emit');

                configurable.configure(config);

                assert.calledWith(configurable.emit, 'error');
            });

            it('should respect semicolon in quoted property value', function() {
                process.env.LUSTER_CONF = 'foo="baz;"';

                configurable.configure(config);

                assert.strictEqual(configurable.config.foo, 'baz;');
            });

            it('should respect equality sign in quoted property value', function() {
                process.env.LUSTER_CONF = 'foo="baz=bar"';

                configurable.configure(config);

                assert.strictEqual(configurable.config.foo, 'baz=bar');
            });

            it('should parse json from propval', function() {
                process.env.LUSTER_CONF = 'properties={"foo":true,"baz":"bar"}';

                configurable.configure(config);

                assert.strictEqual(configurable.config.properties.foo, true);
                assert.strictEqual(configurable.config.properties.baz, 'bar');
            });

            it('should override complex property with a scalar value', function() {
                process.env.LUSTER_CONF = 'server=true';

                configurable.configure(config);

                assert.strictEqual(configurable.config.server, true);
            });

            it('should throw when trying to set inner property to a scalar property', function() {
                process.env.LUSTER_CONF = 'foo.bar=true';

                assert.throws(function() { configurable.configure(config); },
                    'LusterConfigurationError: Property "" is exist and is not an object');
            });

            it('should do second-level nested property override', function() {
                process.env.LUSTER_CONF = 'server.port=8080';

                configurable.configure(config);

                assert.strictEqual(configurable.config.server.port, 8080);
            });

            it('should do deep nested property override', function() {
                process.env.LUSTER_CONF = 'properties.foo.bar.baz=true';

                configurable.configure(config);

                assert.strictEqual(configurable.config.properties.foo.bar.baz, true);
            });
        });
    });

});