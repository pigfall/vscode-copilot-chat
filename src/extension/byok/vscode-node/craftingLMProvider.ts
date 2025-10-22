/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as child_process from 'child_process';
import * as util from 'util';
import { CancellationToken, LanguageModelChatInformation, LanguageModelChatMessage, LanguageModelChatMessage2, LanguageModelChatProvider, LanguageModelChatRequestMessage, LanguageModelResponsePart2, Progress, ProvideLanguageModelChatResponseOptions } from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';

interface CraftingModel {
	provider: string;
	name: string;
	dialect: {
		model_class: string;
	};
}

export class CraftingModelProvider implements LanguageModelChatProvider<LanguageModelChatInformation> {
	constructor(
		@ILogService protected readonly _logService: ILogService,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
	) {

	}

	async provideLanguageModelChatInformation(options: { silent: boolean }, token: CancellationToken): Promise<LanguageModelChatInformation[]> {
		const runCommand = util.promisify(child_process.exec);
		try {
			const { stdout, stderr } = await runCommand('cs llm models list -o json');
			if (stderr) {
				this._logService.warn(`list models: ${stderr}`);
			}
			const models: CraftingModel[] = JSON.parse(stdout);
			return Promise.resolve(
				models.map((model) => {
					return {
						id: model.name,
						name: model.name,
						family: model.dialect.model_class,
						version: "",
						isUserSelectable: true,
						maxInputTokens: 140000, // TODO
						maxOutputTokens: 140000, // TODO
						capabilities: {
							toolCalling: true,// TODO do not hardcode
						}
					};
				})
			);
		} catch (err) {
			this._logService.error(`list models: ${err.message}`);
			throw err.message;
		}
	}

	async provideLanguageModelChatResponse(model: LanguageModelChatInformation, messages: Array<LanguageModelChatMessage | LanguageModelChatMessage2>, options: ProvideLanguageModelChatResponseOptions, progress: Progress<LanguageModelResponsePart2>, token: CancellationToken): Promise<any> {
		// this._instantiationService.createInstance(OpenAIEndpoint, options, model);
		throw new Error("TODO");
	}

	async provideTokenCount(model: LanguageModelChatInformation, text: string | LanguageModelChatRequestMessage, token: CancellationToken): Promise<number> {
		throw new Error("TODO");
	}
}