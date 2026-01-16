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
import { CraftingModel, CraftingModelPurpose, ICraftingModelService, ListCraftingModelResponse } from '../common/llmconfig';
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
				this._purposeModelMap.set(purpose, m);
				this._purposeModelMapChangedEmitter.fire();
				return m;
			}
		}

		const m = await this._taskSinger.getOrCreate(`getModelByPurpose:${purpose}`, () => this.fetchModelByPurpose(purpose));
		if (m) {
			this._purposeModelMap.set(purpose, m);
		} else {
			this._purposeModelMap.delete(purpose);
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
			return JSON.parse(await resp.text());
		} catch (e) {
			this.logService.error(`fetch ${purpose} model: ${e}`);
			throw e;
		}

	}

	private async findConfiguredModel(value: string): Promise<CraftingModel | null> {
		const allModels = await this.getModels();
		const providerAndName = value.split(':', 2);

		if (providerAndName.length === 2) { // The configuration value is in format `{provider}:{model_name}`.
			const matched = allModels.find((m) => {
				return m.id === value;
			});
			if (matched) {
				return matched;
			}
		}

		// The configuration value is an alias.
		// Find the model with the alias.
		const model = allModels.find((m) => {
			return m?.extra?.aliases?.find((alias) => {
				return alias === value;
			}) !== undefined;
		});
		if (!model) {
			return null;
		}
		return model;
	}

	static async fetchModels(): Promise<CraftingModel[]> {
		const resp = await fetch(`http://${craftingLLMAPIHost}/models?extra=y`);
		if (!resp.ok) {
			throw new Error(`fetch models failed: ${resp.status}`);
		}
		const data: ListCraftingModelResponse = JSON.parse(await resp.text());
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
		return 140000;
	}
	maxInputTokens(model: CraftingModel): number {
		// TODO adjust according to model.
		return 140000;
	}
	supportToolCall(model: CraftingModel): boolean {
		// TODO adjust according to model.
		return true;
	}

	toLanguageModelChatInformation(model: CraftingModel, isDefault: boolean): LanguageModelChatInformation {
		const id = model.id;
		let name = id;
		const providerAndName = model.id.split(':', 2);
		if (providerAndName.length === 2) {
			name = providerAndName[1];
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