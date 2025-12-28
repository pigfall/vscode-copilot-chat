/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execSync } from 'child_process';
import * as vscode from 'vscode';
import { ExtensionContext } from 'vscode';
import { resolve } from '../../../util/vs/base/common/path';
import { baseActivate } from '../vscode/extension';
import { vscodeNodeContributions } from './contributions';
import { registerServices } from './services';

// ###############################################################################################
// ###                                                                                         ###
// ###                 Node extension that runs ONLY in node.js extension host.                ###
// ###                                                                                         ###
// ### !!! Prefer to add code in ../vscode/extension.ts to support all extension runtimes !!!  ###
// ###                                                                                         ###
// ###############################################################################################

//#region TODO@bpasero this needs cleanup
import { OutputChannelName } from '../../../platform/log/vscode/outputChannelLogTarget';
import '../../intents/node/allIntents';

function configureDevPackages() {
	try {
		const sourceMapSupport = require('source-map-support');
		sourceMapSupport.install();
		const dotenv = require('dotenv');
		dotenv.config({ path: [resolve(__dirname, '../.env')] });
	} catch (err) {
		console.error(err);
	}
}
//#endregion

export function activate(context: ExtensionContext, forceActivation?: boolean) {
	// As we has made this extension as the vscode builtin extension, we didn't find a way to disable the builtin extension from code now.
	// So we check the setting to do not really activate the extension by default.
	// The default `github.copilot.chat.enabled` is false now.
	try {
		const output = execSync('cs llm model list -o json');
		const models: Object[] = JSON.parse(output.toString());
		if (models.length === 0) {
			const outputChannel = vscode.window.createOutputChannel(OutputChannelName);
			outputChannel.appendLine(`No models are available. Please configure models in your organization's LLM settings.`);
			vscode.commands.executeCommand('setContext', "github.copilot-chat.noModel", true);
			return;
		}
	} catch (e) {
		const outputChannel = vscode.window.createOutputChannel(OutputChannelName);
		outputChannel.appendLine(`Failed to list models: ${e}`);
		vscode.commands.executeCommand('setContext', "github.copilot-chat.listModelError", true);
		return;
	}

	//if (!vscode.workspace.getConfiguration('github.copilot.chat').get<boolean>("enabled")) {
	//	vscode.commands.executecommand('setcontext', "github.copilot-chat.toenable", true);
	//	const outputChannel = vscode.window.createOutputChannel(OutputChannelName);
	//	outputChannel.appendLine(`Extension disabled. You could enable the extension by setting "github.copilot.chat.enabled": true in your settings. And refresh the web vscode`);
	//	return;
	//}

	return baseActivate({
		context,
		registerServices,
		contributions: vscodeNodeContributions,
		configureDevPackages,
		forceActivation
	});
}
