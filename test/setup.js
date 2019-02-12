/* globals sinon */
'use strict';
const chai = require('chai');

global.sinon = require('sinon');
global.assert = chai.assert;

chai.use(require('sinon-chai'));
chai.use(require('chai-as-promised'));

sinon.assert.expose(chai.assert, { prefix: '' });
