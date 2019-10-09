/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/

import * as odo from '../../src/odo';
import { CliExitData, Cli } from '../../src/cli';
import * as assert from 'assert';
import * as sinon from 'sinon';
import * as chai from 'chai';
import * as sinonChai from 'sinon-chai';
import { ToolsConfig } from '../../src/tools';
import { WindowUtil } from '../../src/util/windowUtils';
import { window, Terminal } from 'vscode';
import jsYaml = require('js-yaml');
import { TestItem } from './openshift/testOSItem';
import { ExecException } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ContextType } from '../../src/odo';

const expect = chai.expect;
chai.use(sinonChai);

suite("odo", () => {
    const odoCli: odo.Odo = odo.OdoImpl.Instance;
    let sandbox: sinon.SinonSandbox;
    const errorMessage = 'Error';
    const context = {
        Application: "app",
        ContextPath: {
            _formatted: "file:///Users//Desktop/comp1/nodejs-ex",
            _fsPath: "/Users//Desktop/comp1/nodejs-ex",
            authority: "",
            fragment: "",
            fsPath: "/Users/Desktop/comp1/nodejs-ex",
            path: "/Users/Desktop/comp1/nodejs-ex",
            query: "",
            scheme: "file"
        },
        Name: "comp1",
        Ports: ["8080/TCP"],
        Project: "project",
        Ref: "master",
        SourceLocation: "https://github.com/sclorg/nodejs-ex",
        Type: "nodejs:latest",
        Url: []
    };

    const service = {
        kind: "ServiceList",
        apiVersion: "odo.openshift.io/v1alpha1",
        metadata: {
            creationTimestamp: null
        },
        items: [{
            kind: "Service",
            apiVersion: "odo.openshift.io/v1alpha1",
            metadata: {
                name: "service",
                creationTimestamp: null
            },
            spec: {
                type: "postgresql-persistent",
                plan: "default"
            },
            status: {
                status: "ProvisionedAndBound"
            }
        }]
    };

    const component = {
        kind: "List",
        apiVersion: "odo.openshift.io/v1alpha1",
        metadata: {},
        items: []
    };

    setup(() => {
        sandbox = sinon.createSandbox();
        sandbox.stub(ToolsConfig, 'getVersion').resolves('0.0.15');
        odoCli.clearCache();
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('command execution', () => {
        let execStub: sinon.SinonStub, toolsStub: sinon.SinonStub;
        const command = 'odo do whatever you do';

        setup(() => {
            execStub = sandbox.stub(Cli.prototype, 'execute');
            toolsStub = sandbox.stub(ToolsConfig, 'detectOrDownload').resolves();
        });

        test('execute calls the given command in shell', async () => {
            const data = { stdout: 'done', stderr: '', error: null };
            execStub.resolves(data);
            const result = await odoCli.execute(command);

            expect(execStub).calledOnceWith(command);
            expect(result).deep.equals(data);
        });

        test('execute calls command with its detected location', async () => {
            const toolPath = 'path/to/tool/tool';
            execStub.resolves({ stdout: 'done', stderr: '', error: null });
            toolsStub.resolves(toolPath);
            await odoCli.execute(command);

            expect(execStub).calledOnceWith(command.replace('odo', `"${toolPath}"`));
        });

        test('execute allows to set its working directory', async () => {
            execStub.resolves({ stdout: 'done', stderr: '', error: null });
            const cwd = 'path/to/some/dir';
            await odoCli.execute(command, cwd);

            expect(execStub).calledOnceWith(command, { cwd: cwd });
        });

        test('execute rejects if an error occurs in the shell command', async () => {
            const err: ExecException = { message: 'ERROR', name: 'err' };
            execStub.resolves({ error: err, stdout: '', stderr: '' });
            try {
                await odoCli.execute(command);
                expect.fail();
            } catch (error) {
                expect(error).equals(err);
            }
        });

        test('execute can be set to pass errors through exit data', async () => {
            const err: ExecException = { message: 'ERROR', name: 'err' };
            execStub.resolves({ error: err, stdout: '', stderr: '' });
            const result = await odoCli.execute(command, null, false);

            expect(result).deep.equals({ error: err, stdout: '', stderr: '' });
        });

        test('executeInTerminal send command to terminal and shows it', async () => {
            const termFake: Terminal = {
                name:  "name",
                processId: Promise.resolve(1),
                sendText: sinon.stub(),
                show: sinon.stub(),
                hide: sinon.stub(),
                dispose: sinon.stub()
            };
            toolsStub.restore();
            toolsStub = sandbox.stub(ToolsConfig, 'detectOrDownload').resolves(path.join('segment1', 'segment2'));
            const ctStub = sandbox.stub(WindowUtil, 'createTerminal').returns(termFake);
            await odoCli.executeInTerminal('cmd');
            expect(termFake.sendText).calledOnce;
            expect(termFake.show).calledOnce;
            expect(ctStub).calledWith('OpenShift', process.cwd(), 'segment1');
        });
    });

    suite('item listings', () => {
        let execStub: sinon.SinonStub, yamlStub: sinon.SinonStub, getSettingStub;
        const project = new TestItem(null, 'project', ContextType.PROJECT);
        const app = new TestItem(project, 'app', ContextType.APPLICATION);

        setup(() => {
            execStub = sandbox.stub(odoCli, 'execute');
            getSettingStub = sandbox.stub(odo.OdoImpl.data, 'getSettings').resolves([context]);
            sandbox.stub(odo.OdoImpl.prototype, 'convertObjectsFromPreviousOdoReleases');
            yamlStub = sandbox.stub(jsYaml, 'safeLoad');
            sandbox.stub(fs, 'readFileSync');
        });

        test('getProjects returns projects under a given cluster', async () => {
            const activeProjs = [{ name: 'project1' }, { name: 'project2'}];
            yamlStub.returns({ ActiveApplications: activeProjs });
            execStub.onFirstCall().resolves({
                error: undefined,
                stdout: 'Server https://172.17.185.52:8443',
                stderr: ''
            });
            execStub.onSecondCall().resolves({
                error: undefined,
                stdout: 'Server https://172.17.185.52:8443',
                stderr: ''
            });
            execStub.onThirdCall().resolves({
                error: undefined,
                stdout: JSON.stringify({
                        items: [
                            {
                                metadata: {
                                    name: 'project1'
                                }
                            }
                        ]
                    }
                ),
                stderr: ''
            });
            const result = await odoCli.getProjects();

            expect(result.length).equals(1);
            expect(result[0].getName()).equals('project1');
        });

        test('getProjects returns empty list if no projects present', async () => {
            execStub.onFirstCall().resolves({
                error: undefined,
                stdout: 'Server https://172.17.185.52:8443',
                stderr: ''
            });
            execStub.onSecondCall().resolves({
                error: undefined,
                stdout: 'Server https://172.17.185.52:8443',
                stderr: ''
            });
            execStub.onThirdCall().resolves({ stdout: '', stderr: '', error: null });
            const result = await odoCli.getProjects();

            expect(result).empty;
        });

        test('getProjects returns empty list if an error occurs', async () => {
            const errorStub = sandbox.stub(window, 'showErrorMessage');
            sandbox.stub(odoCli, 'getClusters').resolves([new TestItem(undefined, 'cluster', ContextType.CLUSTER)]);
            execStub.rejects(errorMessage);
            const result = await odoCli.getProjects();

            expect(result).empty;
            expect(errorStub).calledOnceWith(`Cannot retrieve projects for current cluster. Error: ${errorMessage}`);
        });

        test('getApplications returns applications for a project', async () => {
            execStub.onFirstCall().resolves(JSON.stringify({
                kind: "List",
                apiVersion: "odo.openshift.io/v1alpha1",
                metadata: {},
                items: [{
                    kind: "app",
                    apiVersion: "odo.openshift.io/v1alpha1",
                    metadata: {
                        name: "app",
                        namespace: "project",
                        creationTimestamp: null
                    },
                    spec: {}
                }]
            }));
            const result = await odoCli.getApplications(project);

            expect(result.length).equals(1);
            expect(result[0].getName()).equals('app');
        });

        test('getApplications returns empty list if no odo apps are present', async () => {
            getSettingStub.resolves([]);
            execStub.returns({
                error: undefined,
                stdout: JSON.stringify({
                        items: []
                    }
                ),
                stderr: ''
            });
            const result = await odoCli.getApplications(project);

            expect(result).empty;
        });

        test('getComponents returns components list for an application', async () => {
            const activeApps = [{ name: 'app1', project: 'project1' }, { name: 'app2', project: 'project1'}];
            yamlStub.returns({ ActiveApplications: activeApps });
            execStub.returns({
                error: undefined,
                stdout: JSON.stringify({
                        items: [
                            {
                                metadata: {
                                    name: 'component1',
                                    namespace: 'project'
                                }
                            }
                        ]
                    }
                ),
                stderr: ''
            });
            const result = await odoCli.getApplications(app);

            expect(result.length).equals(1);
            expect(result[0].getName()).equals('component1');
        });

        test('getServices returns services for an application', async () => {
            execStub.onFirstCall().resolves({ error: null, stderr: '', stdout: JSON.stringify(component)});
            execStub.onSecondCall().resolves({ error: null, stderr: '', stdout: JSON.stringify(service)});
            const result = await odoCli.getServices(app);

            expect(execStub).calledWith(odo.Command.listServiceInstances(context.ContextPath.fsPath));
            expect(result.length).equals(1);
        });

        test('getServices returns an empty list if an error occurs', async () => {
            execStub.onFirstCall().resolves({error: undefined, stdout: '', stderr: ''});
            execStub.onSecondCall().rejects(errorMessage);
            const result = await odoCli.getServices(app);

            expect(result).empty;
        });

        test('getServiceTemplates throws exception if service catalog is not enabled', async () => {
            execStub.resolves({error: null, stdout: '', stderr:
                JSON.stringify({
                    kind: "Error",
                    apiVersion: "odo.openshift.io/v1alpha1",
                    message: "unable to list services because Service Catalog is not enabled in your cluster"
                })
            });
            let e: Error;
            try {
                await odoCli.getServiceTemplates();
            } catch (err) {
                e = err;
            }

            expect(e.message).equals("unable to list services because Service Catalog is not enabled in your cluster");

        });

        test('getApplicationChildren returns both components and services for an application', async () => {
            execStub.onFirstCall().resolves({ error: null, stderr: '', stdout: JSON.stringify(component)});
            execStub.onSecondCall().resolves({ error: null, stderr: '', stdout: JSON.stringify(service)});
            const result = await odoCli.getApplicationChildren(app);

            expect(result[0].getName()).deep.equals('comp1');
            expect(result[1].getName()).deep.equals('service');
        });

        test('getStorageNames returns storage items for a component', async () => {
            const component = new TestItem(app, 'comp', ContextType.COMPONENT);
            execStub.returns({
                error: undefined,
                stdout: JSON.stringify({
                        items: [
                            {
                                metadata: {
                                    name: "storage1"
                                }
                            },
                            {
                                metadata: {
                                    name: "storage2"
                                }
                            }
                        ]
                    }
                ),
                stderr: ''
            });
            const result = await odoCli.getStorageNames(component);
            expect(result.length).equals(2);
        });

        test('getRoutes returns URL list items for a component', async () => {
            const component = new TestItem(app, 'comp', ContextType.COMPONENT);
            execStub.returns({
                error: undefined,
                stdout: JSON.stringify({
                        items: [
                            {
                                metadata: {
                                    name: "route1"
                                }
                            },
                            {
                                metadata: {
                                    name: "route2"
                                }
                            }
                        ]
                    }
                ),
                stderr: ''
            });
            const result = await odoCli.getRoutes(component);
            expect(result.length).equals(2);
        });

        test('getComponentChildren returns both routes and storage for a component', async () => {
            const component = new TestItem(app, 'comp', ContextType.COMPONENT);
            execStub.onFirstCall().resolves({error: undefined, stdout: JSON.stringify({
                items: [
                    {
                        metadata: {
                            name: "route1"
                        }
                    },
                    {
                        metadata: {
                            name: "route2"
                        }
                    }
                ]
            }), stderr: ''});
            execStub.onSecondCall().resolves({error: undefined, stdout: JSON.stringify({
                items: [
                    {
                        metadata: {
                            name: "storage1"
                        }
                    },
                    {
                        metadata: {
                            name: "storage2"
                        }
                    }
                ]
            }), stderr: ''});
            const result = await odoCli.getComponentChildren(component);

            expect(result[2].getName()).deep.equals('route1');
            expect(result[0].getName()).deep.equals('storage1');
        });
    });

    suite("catalog integration", () => {
        const nodejs = 'nodejs';

        const odoCatalog = JSON.stringify({
            kind : "ComponentTypeList",
            apiVersion : "odo.openshift.io/v1alpha1",
            items: [
                {
                    kind : "ComponentType",
                    apiVersion : "odo.openshift.io/v1alpha1",
                    metadata: {
                        name : "nodejs",
                        namespace : "openshift",
                        creationTimestamp : null
                    },
                    spec: {
                        allTags: [
                            "10",
                            "8",
                            "8-RHOAR",
                            "latest",
                        ]
                    }
                }
            ]
        });

        const componentCatalog: CliExitData = {
            error: null,
            stderr: '',
            stdout: odoCatalog
        };

        setup(async () => {
            sandbox.stub(odo.OdoImpl.prototype, 'execute').resolves(componentCatalog);
        });

        test("getComponentTypes returns correct component type names", async () => {
            const result = await odoCli.getComponentTypes();
            expect(result.length).equals(1);
            expect(result[0]).equals('nodejs');
        });

        test("getComponentTypeVersions returns correct number of tags for component type", async () => {
            const result = await odoCli.getComponentTypeVersions(nodejs);
            expect(result.length).equals(4);
            expect(result[0]).equals("10");
            expect(result[3]).equals("latest");
        });
    });

    suite("service integration", () => {
        const data: CliExitData = { error: undefined, stderr: null, stdout:
            JSON.stringify({
                kind: "ServiceTypeList",
                apiVersion: "odo.openshift.io/v1alpha1",
                metadata: {
                    creationTimestamp: null
                },
                items: [
                    {
                        kind: "ServiceType",
                        apiVersion: "odo.openshift.io/v1alpha1",
                        metadata: {
                            name: "cakephp-mysql-persistent",
                            creationTimestamp: null
                        },
                        spec: {
                            hidden: false,
                            planList: [
                                "default"
                            ]
                        }
                    },
                ]
            })
        };

        setup(() => {
            sandbox.stub(odo.OdoImpl.prototype, 'execute').resolves(data);
        });

        test("getServiceTemplates returns correct number of services", async () => {
            const result: string[] = await odoCli.getServiceTemplates();
            expect(result.length).equals(1);
            expect(result[0]).equals("cakephp-mysql-persistent");
        });

        test("getServiceTemplatePlans returns correct number of plans for service", async () => {
            const result: string[] = await odoCli.getServiceTemplatePlans("cakephp-mysql-persistent");
            assert.equal(result.length, 1);
            assert.equal(result[0], 'default');
        });
    });

    suite('odo and oc current cluster detection integration', () => {
        const clusterUrl = 'https://localhost:8443';

        const odoVersionOutLoggedIn = [
            'odo v0.0.15 (2f7ed497)',
            '',
            `Server: ${clusterUrl}`,
            'Kubernetes: v1.11.0+d4cacc0'
        ];
        const odoVersionOutLoggedOut = [
            'odo v0.0.15 (2f7ed497)',
            '',
            'Kubernetes: v1.11.0+d4cacc0'
        ];
        const oc = [
            'oc v3.9.0+191fece',
            'kubernetes v1.9.1+a0ce1bc657',
            'features: Basic-Auth',
            '',
            `Server ${clusterUrl}`,
            'kubernetes v1.11.0+d4cacc0'
        ];

        test('extension first uses odo version to get cluster url', async () => {
            sandbox.stub(odo.OdoImpl.prototype, 'execute').resolves({
                error: undefined,
                stdout: odoVersionOutLoggedIn.join('\n'),
                stderr: ''
            });
            const cluster: odo.OpenShiftObject[] = await odo.getInstance().getClusters();
            assert.equal(cluster[0].getName(), clusterUrl);
        });

        test('extension uses oc version to get cluster url as a backup plan', async () => {
            sandbox.stub(odo.OdoImpl.prototype, 'execute').onFirstCall().resolves({
                error: undefined,
                stdout: odoVersionOutLoggedOut.join('\n'),
                stderr: ''
            }).onSecondCall().resolves({
                error: undefined,
                stdout: oc.join('\n'),
                stderr: ''
            });
            const cluster: odo.OpenShiftObject[] = await odo.getInstance().getClusters();
            assert.equal(cluster[0].getName(), clusterUrl);
        });

        test('extension uses odo version to determine if login is required', async () => {
            const stub = sandbox.stub(odoCli, 'execute').resolves({ error: null, stdout: 'logged in', stderr: ''});
            const result = await odoCli.requireLogin();

            expect(stub).calledOnceWith(odo.Command.printOdoVersionAndProjects());
            expect(result).false;
        });

        test('requireLogin returns true if odo is not logged in to the cluster', async () => {
            sandbox.stub(odoCli, 'execute').resolves({ error: null, stdout: '', stderr: 'Please log in to the cluster'});
            const result = await odoCli.requireLogin();

            expect(result).true;
        });
    });
});