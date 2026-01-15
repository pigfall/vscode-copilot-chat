import { CancellationToken, LanguageModelChatInformation, LanguageModelChatMessage, LanguageModelChatMessage2, LanguageModelChatProvider, LanguageModelChatRequestMessage, LanguageModelResponsePart2, Progress, ProvideLanguageModelChatResponseOptions } from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { CopilotLanguageModelWrapper } from '../../conversation/vscode-node/languageModelAccess';
import { CraftingModel, CraftingModelPurpose, ICraftingModelService } from '../../crafting/common/llmconfig';

export class CraftingModelProvider implements LanguageModelChatProvider<LanguageModelChatInformation> {
	protected readonly _lmWrapper: CopilotLanguageModelWrapper;

	constructor(
		protected readonly _craftingModelService: ICraftingModelService,
		@ILogService protected readonly _logService: ILogService,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
	) {
		this._lmWrapper = this._instantiationService.createInstance(CopilotLanguageModelWrapper);
	}

	async provideLanguageModelChatInformation(options: { silent: boolean }, token: CancellationToken): Promise<LanguageModelChatInformation[]> {
		try {
			const allModels = await this._craftingModelService.getModels();
			// Filter the models that has purpose 'GENERIC' or 'CODING'
			const models = allModels.filter((model) => {
				return (model.purposes.includes(CraftingModelPurpose.Generic) || model.purposes.includes(CraftingModelPurpose.Coding));
			});
			if (models.length === 0) {
				return Promise.resolve([]);
			}

			// Choose 'CODING' purpose model ,if not, use 'GENERIC' model.
			let purpose = CraftingModelPurpose.Generic;
			let model = models.find((m) => { return m.purposes.includes(CraftingModelPurpose.Coding); });
			if (model) {
				purpose = CraftingModelPurpose.Coding;
			} else {
				model = models[0];
			}
			// Add a AUTO model to model list. The AUTO model will be the default selected model. And it will use purpose as the model name when calling chat completion api.
			const modelStr = JSON.stringify(model);
			const autoModel = JSON.parse(modelStr) as typeof model; // Copy the model.
			autoModel.provider = '';
			autoModel.name = 'AUTO';
			autoModel.purposes = [purpose];
			models.unshift(autoModel);
			return models.map((m) => {
				return this._craftingModelService.toLanguageModelChatInformation(m, m === autoModel);
			});
		} catch (err) {
			this._logService.error(`get models failed ${err} `);
			throw err.message;
		}
	}

	async provideLanguageModelChatResponse(model: LanguageModelChatInformation, messages: Array<LanguageModelChatMessage | LanguageModelChatMessage2>, options: ProvideLanguageModelChatResponseOptions, progress: Progress<LanguageModelResponsePart2>, token: CancellationToken): Promise<any> {
		const models = await this._craftingModelService.getModels();
		let m: CraftingModel | undefined;
		// Find the model by id.
		if (model.name === 'AUTO' && model.id.split(':').length === 1) { // AUTO model
			m = models.find((m) => { return m.purposes.includes(model.id as CraftingModelPurpose); });
		} else {
			m = models.find(m => m.provider + ":" + m.name === model.id);
		}
		if (!m) {
			this._logService.error(`Model ${model.id} not found`);
			return Promise.reject(`Model ${model.id} not found`);
		}

		const chatEndpoint = this._craftingModelService.getOrCreateChatEndpoint(m);
		return this._lmWrapper.provideLanguageModelResponse(chatEndpoint, messages, options, options.requestInitiator, progress, token);
	}

	async provideTokenCount(model: LanguageModelChatInformation, text: string | LanguageModelChatRequestMessage, token: CancellationToken): Promise<number> {
		throw new Error("Unimplmented");
	}
}