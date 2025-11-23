/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, LanguageModelChatInformation, LanguageModelChatMessage, LanguageModelChatMessage2, LanguageModelChatProvider, LanguageModelChatRequestMessage, LanguageModelResponsePart2, Progress, ProvideLanguageModelChatResponseOptions } from 'vscode';
import { IChatModelInformation } from '../../../platform/endpoint/common/endpointProvider';
import { ILogService } from '../../../platform/log/common/logService';
import { TokenizerType } from '../../../util/common/tokenizer';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { CopilotLanguageModelWrapper } from '../../conversation/vscode-node/languageModelAccess';
import { ICraftingModelService } from '../../crafting/common/llmconfig';
import { OpenAIEndpoint } from '../node/openAIEndpoint';

export class CraftingModelProvider implements LanguageModelChatProvider<LanguageModelChatInformation> {
	protected readonly _lmWrapper: CopilotLanguageModelWrapper;

	constructor(
		readonly _craftingModelService: ICraftingModelService,
		@ILogService protected readonly _logService: ILogService,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
	) {
		this._lmWrapper = this._instantiationService.createInstance(CopilotLanguageModelWrapper);
	}

	async provideLanguageModelChatInformation(options: { silent: boolean }, token: CancellationToken): Promise<LanguageModelChatInformation[]> {
		try {
			const models = await this._craftingModelService.getModels();
			// this._logService.info(`DEBUG get models succeeded ${models}`);
			return Promise.resolve(
				models.map((model) => {
					return {
						id: model.provider + ":" + model.name,
						name: model.name,
						family: "TODO",
						isDefault: models[0] === model,
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
			this._logService.error(`get models failed ${err} `);
			throw err.message;
		}
	}

	async provideLanguageModelChatResponse(model: LanguageModelChatInformation, messages: Array<LanguageModelChatMessage | LanguageModelChatMessage2>, options: ProvideLanguageModelChatResponseOptions, progress: Progress<LanguageModelResponsePart2>, token: CancellationToken): Promise<any> {

		const modelInfo: IChatModelInformation = {
			id: model.name,
			name: model.name,
			model_picker_enabled: true,
			is_chat_default: false,
			is_chat_fallback: false,
			version: model.version,
			capabilities: {
				type: "chat",
				family: model.id,
				supports: {
					streaming: true,
				},
				tokenizer: TokenizerType.O200K,
			}
		};
		const provider = model.id.split(":")[0];
		const openAIChatEndpoint = this._instantiationService.createInstance(OpenAIEndpoint, modelInfo, "", `http://${provider}.proxy.llm.g.sandbox/chat/completions`);
		return this._lmWrapper.provideLanguageModelResponse(openAIChatEndpoint, messages, options, options.requestInitiator, progress, token);
	}

	async provideTokenCount(model: LanguageModelChatInformation, text: string | LanguageModelChatRequestMessage, token: CancellationToken): Promise<number> {
		throw new Error("TODO");
	}
}