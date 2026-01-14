import { execSync } from 'child_process';
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
import { AgentSetup, CraftingModel, ICraftingModelService } from '../common/llmconfig';

export class CraftingModelService extends Disposable implements ICraftingModelService {
	private _taskSinger = new TaskSingler<any>();

	private readonly _modelsQuerieddEmitter = this._register(new Emitter<void>());
	readonly onDidModelQueried = this._modelsQuerieddEmitter.event;
	private _lastUsed: IChatEndpoint | undefined;

	private _models: CraftingModel[] | undefined;
	private chatEndpointMap: Map<string, IChatEndpoint> = new Map<string, IChatEndpoint>();

	constructor(
		@ILogService private readonly logService: ILogService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	getOrCreateChatEndpoint(model: CraftingModel): IChatEndpoint {
		let id = `${model.provider}:${model.name}`;
		if (model.provider === "" && model.name === 'AUTO') {
			id = model.purposes[0];
		}
		const name = id;
		let endpoint = this.chatEndpointMap.get(id);
		if (endpoint) {
			this._lastUsed = endpoint;
			return endpoint;
		}
		endpoint = this.instantiationService.createInstance(
			OpenAIEndpoint,
			{
				id: id,
				name: name,
				model_picker_enabled: true,
				is_chat_default: false,
				is_chat_fallback: false,
				version: model.dialect?.sub_class ?? "",
				capabilities: {
					limits: {
						max_prompt_tokens: this.maxInputTokens(model),
						max_output_tokens: this.maxOutputTokens(model),
					},
					type: "chat",
					family: model.dialect?.model_class ?? "",
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

	/**
	 * Retrieves the list of available crafting models.
	 * Caches the result to avoid repeated calls.
	 * @returns Promise resolving to array of CraftingModel.
	 */
	async getModels(): Promise<CraftingModel[]> {
		if (this._models) {
			return this._models;
		}

		const models = await this._taskSinger.getOrCreate("getModels", () => this.doGetModels());
		this._models = models;
		this._modelsQuerieddEmitter.fire();

		return models;
	}

	static getModels(): CraftingModel[] {
		const output = execSync('/opt/sandboxd/sbin/wsenv env setup');
		const agent: AgentSetup = JSON.parse(output.toString());
		return agent.llm_config?.models ?? [];
	}

	/**
	 * Executes the command to list models from the crafting service.
	 * @returns Promise resolving to array of CraftingModel.
	 */
	private async doGetModels(): Promise<CraftingModel[] | undefined> {
		try {
			return Promise.resolve(CraftingModelService.getModels());
		} catch (e) {
			this.logService.error(`list model: ${e}`);
			return undefined;
		}
	}

	/**
	 * Gets the cached models.
	 * @returns Array of CraftingModel or undefined if not yet loaded.
	 */
	get models(): CraftingModel[] | undefined {
		return this._models;
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
		let id = `${model.provider}:${model.name}`;
		if (model.provider === "" && model.name === "AUTO") { // special handling for AUTO model
			id = model.purposes[0];
		}
		return {
			id: id,
			name: model.name,
			family: model.dialect?.model_class ?? "",
			isDefault: isDefault,
			version: model.dialect?.sub_class ?? "",
			isUserSelectable: true,
			maxInputTokens: this.maxInputTokens(model),
			maxOutputTokens: this.maxOutputTokens(model),
			capabilities: {
				toolCalling: this.supportToolCall(model),
			}
		};
	}
}