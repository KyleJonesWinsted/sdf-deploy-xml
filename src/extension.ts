import * as vscode from 'vscode';
import * as lib from './lib';

export function activate(context: vscode.ExtensionContext) {
	let createResetDeploy = vscode.commands.registerCommand(
		'extension.createResetDeploy',
		lib.createResetDeploy
	);

	let addFileToDeploy = vscode.commands.registerCommand(
		'extension.addFileToDeploy',
		lib.addFileToDeploy
	);

	context.subscriptions.push(createResetDeploy);
	context.subscriptions.push(addFileToDeploy);

}

export function deactivate() { }
