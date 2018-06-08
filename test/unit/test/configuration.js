/* globals sinon,assert,describe,it,beforeEach,afterEach */
'use strict';
const Configuration = require('../../../lib/configuration'),
    LusterConfigurationError = require('../../../lib/errors').LusterConfigurationError,
    fixturesConf = require('../fixtures/luster.conf'),
    helpers = require('../../../lib/configuration/helpers'),
    set = helpers.set,
    get = helpers.get,
    has = helpers.has,
    extend = require('extend');

// suppress stderr from terror
LusterConfigurationError.setLogger(function() {});

describe('Configuration', function() {
    let configuration;
    const sandbox = sinon.sandbox.create();

    afterEach(function() {
        sandbox.restore();
    });

    describe('applyEnvironment', function() {
        beforeEach(function() {
            configuration = extend({}, fixturesConf, true);
        });

        afterEach(function() {
            delete process.env.LUSTER_CONF;
        });

        it('should do simple one-level override', function() {
            process.env.LUSTER_CONF = 'workers=1';

            Configuration.applyEnvironment(configuration);

            assert.strictEqual(configuration.workers, 1);
        });

        it('should override to undefined value via empty string', function() {
            process.env.LUSTER_CONF = 'foo=';

            Configuration.applyEnvironment(configuration);

            assert.isUndefined(configuration.foo);
        });

        it('should do nothing when only propname is provided', function() {
            process.env.LUSTER_CONF = 'foo';

            Configuration.applyEnvironment(configuration);

            assert.strictEqual(configuration.foo, true);
        });

        it('should respect semicolon in quoted property value', function() {
            process.env.LUSTER_CONF = 'foo="baz;"';

            Configuration.applyEnvironment(configuration);

            assert.strictEqual(configuration.foo, 'baz;');
        });

        it('should respect equality sign in quoted property value', function() {
            process.env.LUSTER_CONF = 'foo="baz=bar"';

            Configuration.applyEnvironment(configuration);

            assert.strictEqual(configuration.foo, 'baz=bar');
        });

        it('should parse json from propval', function() {
            process.env.LUSTER_CONF = 'properties={"foo":true,"baz":"bar"}';

            Configuration.applyEnvironment(configuration);

            assert.strictEqual(configuration.properties.foo, true);
            assert.strictEqual(configuration.properties.baz, 'bar');
        });

        it('should throw when trying to set inner property to a scalar property', function() {
            process.env.LUSTER_CONF = 'baz.foo.bar=true';

            assert.throws(function() { Configuration.applyEnvironment(configuration); },
                'LusterConfigurationError: Property "baz.foo" already exists and is not an object');
        });

        it('should do second-level nested property override', function() {
            process.env.LUSTER_CONF = 'server.port=8080';

            Configuration.applyEnvironment(configuration);

            assert.strictEqual(configuration.server.port, 8080);
        });

        it('should do deep nested property override', function() {
            process.env.LUSTER_CONF = 'properties.foo.bar.baz=true';

            Configuration.applyEnvironment(configuration);

            assert.strictEqual(configuration.properties.foo.bar.baz, true);
        });

        describe('should override multiple properties at once', function() {
            it('should respect semicolon separated values', function() {
                process.env.LUSTER_CONF = 'workers=1;foo=false';

                Configuration.applyEnvironment(configuration);

                assert.strictEqual(configuration.workers, 1);
                assert.strictEqual(configuration.foo, false);
            });

            it('whitespaces should not matter', function() {
                process.env.LUSTER_CONF = 'workers = 1; foo =false';

                Configuration.applyEnvironment(configuration);

                assert.strictEqual(configuration.workers, 1);
                assert.strictEqual(configuration.foo, false);
            });
        });
    });

    describe('check', function() {
        it('should emit error when trying to override non-string property with a string', function() {
            configuration.workers = 'some';

            assert.strictEqual(Configuration.check(configuration), 1);
        });
    });

    describe('set helper', function() {
        it('should set first level property', function() {
            const ctx = {};

            set(ctx, 'prop', 123);

            assert.strictEqual(ctx.prop, 123);
        });

        it('should set deeply nested property', function() {
            const ctx = { a: { b: { c: 1 } } };

            set(ctx, 'a.b.c', 2);

            assert.strictEqual(ctx.a.b.c, 2);
        });

        it('should set deeply nested undefined property', function() {
            const ctx = {};

            set(ctx, 'a.b.c', 2);

            assert.strictEqual(ctx.a.b.c, 2);
        });

        it('should fail to set nested property of scalar', function() {
            const ctx = {a: 'hello'};

            assert.throws(function() { set(ctx, 'a.b', 2); },
                'LusterConfigurationError: Property "a" already exists and is not an object');
        });

        it('should override complex property with a scalar value', function() {
            const ctx = { server: { a: 'b' } };

            set(ctx, 'server', true);

            assert.strictEqual(ctx.server, true);
        });

        it('should fail to set element of array', function() {
            const ctx = {a: [1, 2, 3]};

            assert.throws(function() { set(ctx, 'a.1', 5); },
                'LusterConfigurationError: Property "a" already exists and is not an object');
        });

        it('should override getters', function() {
            const ctx = {
                get stderr() {
                    return './error.log';
                },
            };

            set(ctx, 'stderr', '/dev/null');

            assert.strictEqual(ctx.stderr, '/dev/null');
        });
    });

    describe('get helper', function() {
        it('should get first level property', function() {
            const ctx = { prop: 123 };

            assert.strictEqual(get(ctx, 'prop'), 123);
        });

        it('should return default for missing property', function() {
            assert.strictEqual(get({}, 'prop', 123), 123);
        });

        it('should get deeply nested property', function() {
            const ctx = { a: { b: { c: 1 } } };

            assert.strictEqual(get(ctx, 'a.b.c'), 1);
        });

        it('should return default for missing nested property', function() {
            assert.strictEqual(get({}, 'a.b.c', 2), 2);
        });

        it('should return default for nested property of scalar', function() {
            const ctx = { a: 'qqq' };

            assert.strictEqual(get(ctx, 'a.b', 2), 2);
        });

        it('should return complex property', function() {
            const ctx = { server: { a: 'b' } };

            assert.strictEqual(get(ctx, 'server'), ctx.server);
        });

        it('should return value of getters', function() {
            const ctx = {
                get stderr() {
                    return './error.log';
                },
            };

            assert.strictEqual(get(ctx, 'stderr'), './error.log');
        });
    });

    describe('has helper', function() {
        it('should find first level property', function() {
            const ctx = { prop: 123 };

            assert.strictEqual(has(ctx, 'prop'), true);
        });

        it('should find complex property', function() {
            const ctx = { server: { a: 'b' } };

            assert.strictEqual(has(ctx, 'server'), true);
        });

        it('should not find for missing property', function() {
            assert.strictEqual(has({}, 'prop'), false);
        });

        it('should get deeply nested property', function() {
            const ctx = { a: { b: { c: 1 } } };

            assert.strictEqual(has(ctx, 'a.b.c'), true);
        });

        it('should not find missing nested property', function() {
            const ctx = {a: {}};

            assert.strictEqual(has(ctx, 'a.b.c'), false);
        });

        it('should not find nested property of scalar', function() {
            const ctx = { a: 'qqq' };

            assert.strictEqual(has(ctx, 'a.b', 2), false);
        });

        it('should find getters', function() {
            const ctx = {
                get stderr() {
                    return './error.log';
                },
            };

            assert.strictEqual(has(ctx, 'stderr'), true);
        });
    });
});
