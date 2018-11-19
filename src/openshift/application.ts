/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/

import { OpenShiftItem } from './openshiftItem';
import { OpenShiftObject } from '../odo';
import * as vscode from 'vscode';
import * as validator from 'validator';

export class Application extends OpenShiftItem {
    static async create(project: OpenShiftObject): Promise<String> {
        let projectName;
        let appName;
        if (project) {
            projectName = project;
        } else {
            projectName = await Application.odo.getProjects();
            if (projectName.length === 0) {
                await vscode.window.showErrorMessage('Sorry there are no project to create an application (Please create new project and try again)');
            }else if (projectName.length > 1 ) {
                projectName = await vscode.window.showQuickPick(projectName, {placeHolder: "In which project you want to create Application"});
            } else if (projectName[0]) {
                projectName = projectName[0];
            }
        }
        if (projectName.length > 0) {
            appName = await vscode.window.showInputBox({
                prompt: "Application name",
                validateInput: (value: string) => {
                    if (validator.isEmpty(value.trim())) {
                        return 'Empty application name';
                    }
                    if (!validator.matches(value.trim(), '^[a-z0-9]([-a-z0-9]*[a-z0-9])*$')) {
                        return 'Not a valid application name. Please use lower case alphanumeric characters or "-", and must start and end with an alphanumeric character';
                    }
                }
            });
        }
        if (appName) {
            return Promise.resolve()
                .then(() => Application.odo.execute(`odo app create ${appName.trim()} --project ${projectName.getName()}`))
                .then(() => Application.explorer.refresh(project))
                .then(() => `Application '${appName}' successfully created`)
                .catch((error) => Promise.reject(`Failed to create application with error '${error}'`));
        }
        return null;
    }

    static describe(treeItem: OpenShiftObject): void {
        const projName: string = treeItem.getParent().getName();
        const appName: string = treeItem.getName();
        Application.odo.executeInTerminal(`odo app describe ${appName} --project ${projName}`);
    }

    static async del(treeItem: OpenShiftObject): Promise<string> {
        let application: OpenShiftObject;
        let project: OpenShiftObject;
        if (treeItem) {
            project = treeItem.getParent();
            application = treeItem;
        } else {
            project = await vscode.window.showQuickPick(Application.odo.getProjects(), {placeHolder: "From which project you want to delete Application"});
            if (project) {
                application = await vscode.window.showQuickPick(Application.odo.getApplications(project), {placeHolder: "Select Application to delete"});
            }
        }
        if (application) {
            const appName = application.getName();
            const projName = project.getName();
            const value = await vscode.window.showWarningMessage(`Are you sure you want to delete application '${appName}?'`, 'Yes', 'Cancel');
            if (value === 'Yes') {
                return Promise.resolve()
                    .then(() => Application.odo.execute(`odo app delete ${appName} --project ${projName} -f`))
                    .then(() => Application.explorer.refresh(treeItem ? treeItem.getParent() : undefined))
                    .then(() => `Application '${appName}' successfully deleted`)
                    .catch((err) => Promise.reject(`Failed to delete application with error '${err}'`));
            }
        }
        return null;
    }
}