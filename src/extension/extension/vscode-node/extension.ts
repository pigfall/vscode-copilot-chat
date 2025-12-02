/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
	if (!vscode.workspace.getConfiguration('github.copilot.chat').get<boolean>("enabled")) {
		const outputChannel = vscode.window.createOutputChannel(OutputChannelName);
		outputChannel.appendLine(`Extension disabled. You could enable the extension by setting "github.copilot.chat.enabled": true in your settings. And refresh the web vscode`);
		return;
	}

	return baseActivate({
		context,
		registerServices,
		contributions: vscodeNodeContributions,
		configureDevPackages,
		forceActivation
	});
}
