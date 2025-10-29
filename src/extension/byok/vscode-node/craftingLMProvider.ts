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
import { OpenAIEndpoint } from '../node/openAIEndpoint';

interface CraftingModelListResponse {
	data: CraftingModel[];
}

interface CraftingModel {
	id: string;
	extra: {
		dialect: {
			source: string;
			model_class: string;
			sub_class: string;
		};
	};
}

export class CraftingModelProvider implements LanguageModelChatProvider<LanguageModelChatInformation> {
	protected readonly _lmWrapper: CopilotLanguageModelWrapper;
	private readonly chatAPIUrl: string;
	private readonly modelAPIUrl: string;
	private token: string;

	constructor(
		@ILogService protected readonly _logService: ILogService,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
	) {
		this._lmWrapper = this._instantiationService.createInstance(CopilotLanguageModelWrapper);
		// TODO get chat url by `cs system info`
		this.chatAPIUrl = "http://localhost:8000/orgs/org/chat";
		this.modelAPIUrl = "http://localhost:8000/orgs/org/models?extra=y";
		// TODO get crafting token.
		this.token = "TODO";
	}

	async provideLanguageModelChatInformation(options: { silent: boolean }, token: CancellationToken): Promise<LanguageModelChatInformation[]> {
		// const runCommand = util.promisify(child_process.exec);
		const modelAPIUrl = this.modelAPIUrl;
		try {
			const response = await fetch(
				modelAPIUrl,
				{
					method: "POST",
					headers: {
						'Authroization': `Bearer ${this.token}`,
					}
				}
			);
			if (response.status !== 200) {
				const respBody = await response.text();
				this._logService.error(`list models error, status code ${response.status}: ${respBody}`);
				return Promise.reject([]);
			}
			const respBody = await response.text();
			const listModelResp: CraftingModelListResponse = JSON.parse(respBody);
			return Promise.resolve(
				listModelResp.data.map((model) => {
					return {
						id: model.id,
						name: model.id,
						family: model.extra.dialect.model_class,
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
			this._logService.error(`list models from ${modelAPIUrl}: ${err.message}`);
			throw err.message;
		}
	}

	async provideLanguageModelChatResponse(model: LanguageModelChatInformation, messages: Array<LanguageModelChatMessage | LanguageModelChatMessage2>, options: ProvideLanguageModelChatResponseOptions, progress: Progress<LanguageModelResponsePart2>, token: CancellationToken): Promise<any> {
		// const url = "https://crafting.sandboxes.site/ext/llm/api/orgs/eng/chat";
		//const url = "http://localhost:8000/orgs/org/chat";

		const modelInfo: IChatModelInformation = {
			id: model.id,
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
		const openAIChatEndpoint = this._instantiationService.createInstance(OpenAIEndpoint, modelInfo, this.token, this.chatAPIUrl);
		return this._lmWrapper.provideLanguageModelResponse(openAIChatEndpoint, messages, options, options.requestInitiator, progress, token);
	}

	async provideTokenCount(model: LanguageModelChatInformation, text: string | LanguageModelChatRequestMessage, token: CancellationToken): Promise<number> {
		throw new Error("TODO");
	}
}