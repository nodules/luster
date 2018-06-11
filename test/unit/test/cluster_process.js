/* globals sinon,assert,describe,it,beforeEach,afterEach */
'use strict';
const ClusterProcess = require('../../../lib/cluster_process'),
    Configuration = require('../../../lib/configuration'),
    fixturesConf = require('../fixtures/luster.conf');

/**
 * ClusterProcess is an abstract class, it cannot be instantiated for tests;
 * TestClusterProcess is a smalles possible descendant of ClusterProcess;
 */
class TestClusterProcess extends ClusterProcess {
    _setupIPCMessagesHandler() {}
}

describe('ClusterProcess', () => {
    let clusterProcess;
    const sandbox = sinon.sandbox.create();

    afterEach(() => sandbox.restore());

    describe('configure', () => {
        let config;

        beforeEach(() => {
            clusterProcess = new TestClusterProcess();
            config = Object.assign({}, fixturesConf, true);
            clusterProcess.addListener('error', () => {});
        });

        afterEach(() => clusterProcess.removeAllListeners('error'));

        it('should emit "configured" event on configuration success', () => {
            const spy = sandbox.spy();

            clusterProcess.on('configured', spy);
            clusterProcess.configure(config);

            assert.calledOnce(spy);
        });

        it('should emit "error" event for malformed config', () => {
            const spy = sandbox.spy();

            clusterProcess.on('error', spy);
            clusterProcess.configure({});

            assert.calledOnce(spy);
        });

        it('should not apply env config if overriding is explicitly turned off', () => {
            process.env.LUSTER_CONF = 'workers=1';

            clusterProcess.configure(config, false);

            assert.strictEqual(clusterProcess.config.get('workers'), 10);
        });

        it('should run checkConfiguration after applyEnv', () => {
            const applyEnv = sandbox.spy(Configuration, 'applyEnvironment'),
                check = sandbox.spy(Configuration, 'check');
            clusterProcess.configure(config);
            assert(check.calledAfter(applyEnv));
        });
    });
});
