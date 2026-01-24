import { LanguageModelChatInformation } from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { craftingLLMAPIHost } from '../../../util/common/crafting';
import { TaskSingler } from '../../../util/common/taskSingler';
import { TokenizerType } from '../../../util/common/tokenizer';
import { Emitter } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { OpenAIEndpoint } from '../../byok/node/openAIEndpoint';
import { CraftingModel, CraftingModelPurpose, ICraftingModelService, isCraftingModelPurpose, ListCraftingModelResponse } from '../common/types';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';

export class CraftingModelService extends Disposable implements ICraftingModelService {
	private _taskSinger = new TaskSingler<any>();

	private readonly _modelsChangedEmitter = this._register(new Emitter<void>());
	readonly onModelsChanged = this._modelsChangedEmitter.event;
	private _lastUsed: IChatEndpoint | undefined;

	private _models: CraftingModel[] | undefined;
	private chatEndpointMap: Map<string, IChatEndpoint> = new Map<string, IChatEndpoint>();
	private _purposeModelMap: Map<CraftingModelPurpose, CraftingModel> = new Map<CraftingModelPurpose, CraftingModel>();
	private readonly _purposeModelMapChangedEmitter = this._register(new Emitter<void>());
	readonly onPurposeModelMapChanged = this._purposeModelMapChangedEmitter.event;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFetcherService private readonly fetcherService: IFetcherService,
	) {
		super();
	}

	getOrCreateChatEndpoint(model: CraftingModel): IChatEndpoint {
		const id = model.id;
		let endpoint = this.chatEndpointMap.get(id);
		if (endpoint) {
			this._lastUsed = endpoint;
			return endpoint;
		}
		endpoint = this.instantiationService.createInstance(
			OpenAIEndpoint,
			{
				id: id,
				name: id,
				model_picker_enabled: true,
				is_chat_default: false,
				is_chat_fallback: false,
				version: model?.extra?.dialect?.sub_class ?? "",
				capabilities: {
					limits: {
						max_prompt_tokens: this.maxInputTokens(model),
						max_output_tokens: this.maxOutputTokens(model),
					},
					type: "chat",
					family: model?.extra?.dialect?.model_class ?? "",
					supports: {
						streaming: true,
						tool_calls: this.supportToolCall(model),
					},
					tokenizer: TokenizerType.O200K,
				}
			},
			"",
			`http://${craftingLLMAPIHost}/chat/completions`
		);
		this.chatEndpointMap.set(id, endpoint);
		this._lastUsed = endpoint;
		return endpoint;
	}

	lastUsedChatEndpoint(): IChatEndpoint | undefined {
		return this._lastUsed;
	}

	async getModelByPurpose(purpose: CraftingModelPurpose, ignoreCache?: boolean): Promise<CraftingModel | null> {
		if (!ignoreCache) {
			const cached = this._purposeModelMap.get(purpose);
			if (cached) {
				return cached;
			}
		}

		let specifiedModel: string | undefined;
		switch (purpose) {
			case CraftingModelPurpose.CodingFIM:
				specifiedModel = this.configurationService.getConfig(ConfigKey.FIMCompletionModelName);
				break;
			case CraftingModelPurpose.CodingNES:
				specifiedModel = this.configurationService.getConfig(ConfigKey.NESCompletionModelName);
				break;
		}
		if (specifiedModel) {
			const m = await this.findConfiguredModel(specifiedModel);
			if (m) {
				// Replace with the new map to trigger change event.
				// The in place update of map won't trigger observable change even if we fire the event.
				const newMap = new Map(this._purposeModelMap);
				this._purposeModelMap = newMap.set(purpose, m);
				this._purposeModelMapChangedEmitter.fire();
				return m;
			}
		}

		const m = await this._taskSinger.getOrCreate(`getModelByPurpose:${purpose}`, () => this.fetchModelByPurpose(purpose));
		if (m) {
			// Replace with the new map to trigger change event.
			const newMap = new Map(this._purposeModelMap);
			this._purposeModelMap = newMap.set(purpose, m);
		} else {
			// Replace with the new map to trigger change event.
			const newMap = new Map(this._purposeModelMap);
			newMap.delete(purpose);
			this._purposeModelMap = newMap;
		}
		this._purposeModelMapChangedEmitter.fire();

		return m ?? null;
	}

	/**
	 * Retrieves the list of available crafting models.
	 * Caches the result to avoid repeated calls.
	 * @returns Promise resolving to array of CraftingModel.
	 */
	async getModels(): Promise<CraftingModel[]> {
		if (this._models) {
			return this._models;
		}

		const models = await this._taskSinger.getOrCreate("getModels", () => CraftingModelService.fetchModels());
		this._models = models;
		this._modelsChangedEmitter.fire();
		return models;
	}

	private async fetchModelByPurpose(purpose: CraftingModelPurpose): Promise<CraftingModel | null> {
		try {
			const resp = await this.fetcherService.fetch(`http://${craftingLLMAPIHost}/models/${purpose}?extra=y`, { method: 'GET' });
			if (resp.status === 404) {
				this.logService.info(`no ${purpose} model available`);
				return null;
			}
			if (!resp.ok) {
				const content = await resp.text();
				throw new Error(`fetch ${purpose} model failed: ${resp.status} ${content}`);
			}
			return await resp.json();
		} catch (e) {
			this.logService.error(`fetch ${purpose} model: ${e}`);
			throw e;
		}

	}

	private async findConfiguredModel(value: string): Promise<CraftingModel | null> {
		const allModels = await this.getModels();
		return allModels.find((m) => { return m.id === value; }) ?? null;
	}

	static async fetchModels(): Promise<CraftingModel[]> {
		const resp = await fetch(`http://${craftingLLMAPIHost}/models?extra=y`);
		if (!resp.ok) {
			const content = await resp.text();
			throw new Error(`fetch models failed: ${resp.status}, ${content}`);
		}
		const data = await resp.json() as ListCraftingModelResponse;
		return data.data;
	}

	/**
	 * Gets the cached models.
	 * @returns Array of CraftingModel or undefined if not yet loaded.
	 */
	get models(): CraftingModel[] | undefined {
		return this._models;
	}

	get purposeModelMap(): Map<CraftingModelPurpose, CraftingModel> {
		return this._purposeModelMap;
	}

	maxOutputTokens(model: CraftingModel): number {
		// TODO adjust according to model.
		return 200000;
	}
	maxInputTokens(model: CraftingModel): number {
		return model?.extra?.properties?.context_window_limit ?? 200000;
	}
	supportToolCall(model: CraftingModel): boolean {
		// TODO adjust according to model.
		return true;
	}

	toLanguageModelChatInformation(model: CraftingModel, isDefault: boolean): LanguageModelChatInformation {
		const id = model.id;
		let name = id;
		const providerAndName = model.id.split(':', 2);
		// The name will be showed to user.
		if (providerAndName.length === 2) { // If the id is `provider:model_name`. Retrive the model_name.
			name = providerAndName[1];
		} else if (isCraftingModelPurpose(id.toUpperCase())) { // If the id is a purpose, use a friendly name.
			switch (id.toUpperCase() as CraftingModelPurpose) {
				case CraftingModelPurpose.Generic:
					name = "Generic";
					break;
				case CraftingModelPurpose.Coding:
					name = "Coding";
					break;
				case CraftingModelPurpose.CodingFIM: // TODO should we allow this type model to be user selectable at chat panel?
					name = "Coding FIM";
					break;
				case CraftingModelPurpose.CodingNES: // TODO should we allow this type model to be user selectable at chat panel?
					name = "Coding NES";
					break;
			}
		}


		return {
			id: id,
			name: name,
			family: model?.extra?.dialect?.model_class ?? "",
			isDefault: isDefault,
			version: model?.extra?.dialect?.sub_class ?? "",
			isUserSelectable: true,
			maxInputTokens: this.maxInputTokens(model),
			maxOutputTokens: this.maxOutputTokens(model),
			capabilities: {
				toolCalling: this.supportToolCall(model),
			}
		};
	}
}