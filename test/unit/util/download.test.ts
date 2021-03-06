/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/

'use strict';

import * as chai from 'chai';
import * as sinonChai from 'sinon-chai';
import * as sinon from 'sinon';
import { wait } from '../../../src/util/async';
import pq = require('proxyquire');
import { EventEmitter } from 'events';

const expect = chai.expect;
chai.use(sinonChai);

suite('Download Util', () => {
    let progressMock;
    const sandbox: sinon.SinonSandbox = sinon.createSandbox();
    let requestEmitter: EventEmitter;
    let streamEmitter: EventEmitter;

    setup(() => {
        requestEmitter = new EventEmitter();
        streamEmitter = new EventEmitter();
        requestEmitter['pipe'] = () => streamEmitter;
        progressMock = pq('../../../src/util/download', {
            got: {
                stream: () => requestEmitter
            },
            stream: {
                pipeline: async (a, b, cb) => {
                    await wait(300);
                    requestEmitter.emit('downloadProgress', {percent: 0.33});
                    await wait(300);
                    requestEmitter.emit('downloadProgress', {percent: 0.66});
                    await wait(300);
                    requestEmitter.emit('end');
                    cb(null);
                }
            }
        }).DownloadUtil;
    });

    teardown(() => {
        sandbox.restore();
    });

    test('reports download progress', async () => {
        const callback = sandbox.stub();
        const result = progressMock.downloadFile('url', 'toFile', callback);
        return result.then(() => {
            expect(callback).calledWith(33, 33);
            expect(callback).calledWith(66, 33);
            expect(callback).calledWith(100, 34);
        });
    });
});