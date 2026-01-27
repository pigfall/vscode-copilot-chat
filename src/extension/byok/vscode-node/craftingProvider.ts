import { CancellationToken, LanguageModelChatInformation, LanguageModelChatMessage, LanguageModelChatMessage2, LanguageModelChatProvider, LanguageModelChatRequestMessage, LanguageModelResponsePart2, Progress, ProvideLanguageModelChatResponseOptions } from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { CopilotLanguageModelWrapper } from '../../conversation/vscode-node/languageModelAccess';
import { CraftingModelPurpose, ICraftingModelService } from '../../crafting/common/types';

// The CraftingModelProvider implements vscode LanguageModelChatProvider.
export class CraftingModelProvider implements LanguageModelChatProvider<LanguageModelChatInformation> {
	protected readonly _lmWrapper: CopilotLanguageModelWrapper;

	constructor(
		protected readonly _craftingModelService: ICraftingModelService,
		@ILogService protected readonly _logService: ILogService,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
	) {
		this._lmWrapper = this._instantiationService.createInstance(CopilotLanguageModelWrapper);
	}

	// The provideLanguageModelChatInformation returns the models will be shown in the chat model picker.
	async provideLanguageModelChatInformation(options: { silent: boolean }, token: CancellationToken): Promise<LanguageModelChatInformation[]> {
		try {
			const allModels = await this._craftingModelService.getModels();
			return allModels.filter((m) => {
				// Do not include the model which id is purpose `CODING_FIM` or `CODING_NES`.
				const id = m.id.toUpperCase();
				return id !== CraftingModelPurpose.CodingFIM && id !== CraftingModelPurpose.CodingNES;
			}).map((m, index) => {
				return this._craftingModelService.toLanguageModelChatInformation(m, m === allModels[0], index);
			});
		} catch (err) {
			this._logService.error(`get models failed ${err.message} `);
			throw err;
		}
	}

	// Implement provideLanguageModelChatResponse.
	async provideLanguageModelChatResponse(inputModel: LanguageModelChatInformation, messages: Array<LanguageModelChatMessage | LanguageModelChatMessage2>, options: ProvideLanguageModelChatResponseOptions, progress: Progress<LanguageModelResponsePart2>, token: CancellationToken): Promise<any> {
		const m = (await this._craftingModelService.getModels()).find(m => m.id === inputModel.id);

		if (!m) {
			this._logService.error(`Model ${inputModel.id} not found`);
			return Promise.reject(`Model ${inputModel.id} not found`);
		}

		// Create the endpoint by CraftingModel and call CopilotLanguageModelWrapper to provide response.
		const chatEndpoint = this._craftingModelService.getOrCreateChatEndpoint(m);
		return this._lmWrapper.provideLanguageModelResponse(chatEndpoint, messages, options, options.requestInitiator, progress, token);
	}

	async provideTokenCount(model: LanguageModelChatInformation, text: string | LanguageModelChatRequestMessage, token: CancellationToken): Promise<number> {
		// TODO
		throw new Error("Unimplmented");
	}
}