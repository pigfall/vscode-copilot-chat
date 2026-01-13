/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ExtensionContext } from 'vscode';
import { OutputChannelName } from '../../../platform/log/vscode/outputChannelLogTarget';
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
import { CraftingModelService } from '../../crafting/vscode-node/modelService';
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
	// Do not activate if there is not any model.
	try {
		const models = CraftingModelService.getModels();
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

	return baseActivate({
		context,
		registerServices,
		contributions: vscodeNodeContributions,
		configureDevPackages,
		forceActivation
	});
}
