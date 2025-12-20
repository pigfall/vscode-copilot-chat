import { exec } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ILogService } from '../../../platform/log/common/logService';
import { craftingLLMAPIHost } from '../../../util/common/crafting';
import { TaskSingler } from '../../../util/common/taskSingler';
import { createTracer, ITracer } from '../../../util/common/tracing';
import { Emitter } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { autorun, observableFromEvent } from '../../../util/vs/base/common/observable';
import { CraftingModel, ICraftingModelService } from '../common/llmconfig';

// The CraftingConfigCopilotContribution will use IConfigurationService to modify the configuration for copilot.
export class CraftingConfigCopilotContribution extends Disposable {
	private readonly _models = observableFromEvent(this, this._modelService.onDidModelQueried, () => this._modelService.models);
	private readonly _infoTracer: ITracer;
	private readonly _errorTracer: ITracer;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ICraftingModelService private readonly _modelService: ICraftingModelService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._infoTracer = createTracer(['crafting'], (msg) => this._logService.info(msg));
		this._errorTracer = createTracer(['crafting'], (msg) => this._logService.error(msg));

		this._infoTracer.trace("CraftingConfigCopilotContribution contributed");
		this._register(autorun((reader) => {
			const models = this._models.read(reader);
			if (models === undefined) {
				setTimeout(() => {
					this._modelService.getModels();
				}, 1000 * 3);
				return;
			}
			// Trigger to refresh the model list which is showed in model picker.
			vscode.lm.selectChatModels();
			// Activate FIM completion if has supported model.
			this.activateFIMCompletionIfHasSupportedModel(models);
			// Activate Next Edit Suggestion if has supported model.
			this.activateNextEditSuggestionIfHasSupportedModel(models);
		}));
		this._modelService.getModels();
	}

	// Activate Next Edit Suggestion if has supported model.
	private activateNextEditSuggestionIfHasSupportedModel(models: CraftingModel[]) {
		const enabled = this._configurationService.getConfig(ConfigKey.Internal.NESEnabled);
		if (!enabled) {
			this._infoTracer.trace(`Disabled Next Edit Suggestion`);
			return;
		}

		if (models.length === 0) {
			this.deactivateNES(`no model available`);
			return;
		}

		const model = models[0];
		const nesURL = `http://${craftingLLMAPIHost}/chat/completions`;
		Promise.all(
			[
				this._configurationService.setConfig(ConfigKey.Internal.InlineEditsUnification, true),
				this._configurationService.setConfig(ConfigKey.Internal.InlineEditsXtabProviderUrl, nesURL),
				this._configurationService.setConfig(ConfigKey.Internal.InlineEditsXtabProviderModelName, `${model.provider}:${model.name}`)
			]
		).then(
			() => {
				this._infoTracer.trace(`Activated Next Edit Suggestion with model: ${model.name}`);
			},
			(e) => {
				this._errorTracer.trace(`Failed to activate Next Edit Suggestion: ${e}`);
			}
		);
	}


	// Activate FIM Completion if has supported model.
	private activateFIMCompletionIfHasSupportedModel(models: CraftingModel[]) {
		const enabled = this._configurationService.getConfig(ConfigKey.Internal.FIMCompletionEnabled);
		if (!enabled) {
			this._infoTracer.trace(`Disabled FIM completion`);
			return;
		}

		if (!models || models.length === 0) {
			this.deactivateFIMCompletion("no model available");
			return;
		}
		const configurationModel = this._configurationService.getConfig(ConfigKey.Internal.FIMCompletionModelName);
		if (configurationModel === undefined || configurationModel === "") {
			// Auto select a FIM completion model.
			this.activateFIMCompletionWithAutoSelectModel(models);
			return;
		}

		// User configed the FIM model, check if the models exists, if not, auto select a model.
		const providerAndModel = configurationModel.split(":", 2);
		if (providerAndModel.length !== 2) {
			// Deactivate the FIM completion because the the model specified by user is invalid.
			this.deactivateFIMCompletion(`invalid FIM completion model config: ${configurationModel}`);
			return;
		}
		const configurationModelObject = models.find((model) => {
			return model.provider === providerAndModel[0] && model.name === providerAndModel[1];
		});
		if (configurationModelObject === undefined) {
			this._infoTracer.trace(`User specified FIM completion model (${configurationModel}) not found in available models, auto-selecting a supported model.`);
			// The model specified by user is not found. Auto choose an another model.
			this.activateFIMCompletionWithAutoSelectModel(models);
			return;
		}

		// Activate the FIM completion with the user-specified model.
		this.activateFIMCompletion(configurationModelObject.provider, configurationModelObject.name);
	}

	private activateFIMCompletionWithAutoSelectModel(models: CraftingModel[]) {
		// Let's choose the gpt-3.5-turbo-instruct firstly.
		const matchedModels = models.filter((model) => {
			return model.name === "gpt-3.5-turbo-instruct";
		});
		let fimModel: undefined | CraftingModel;
		if (matchedModels && matchedModels.length > 0) {
			fimModel = matchedModels[0];
		} else {
			// There is not gpt-3.5-turbo-instruct, choose the first model.
			fimModel = models[0];
		}

		// Enable FIM completion.
		this.activateFIMCompletion(fimModel.provider, fimModel.name);
		return;
	}

	private deactivateFIMCompletion(reason: String) {
		const ghCompletionEnabled = this._configurationService.getConfig(ConfigKey.Internal.InlineEditsEnableGhCompletionsProvider);
		if (!ghCompletionEnabled) {
			this._infoTracer.trace(`Deactivated FIM completion: ${reason}`);
			return;
		}

		this._infoTracer.trace(`Deactivating FIM completion: ${reason}`);
		this._configurationService.setConfig(ConfigKey.Internal.InlineEditsEnableGhCompletionsProvider, false).then(
			() => {

				this._infoTracer.trace(`Deactivated FIM completion`);
			},
			(e) => {
				this._errorTracer.trace(`Failed to deactivate FIM completion: ${e}`);
			},
		);
	}

	private deactivateNES(reason: String) {
		const enabled = this._configurationService.getConfig(ConfigKey.Internal.InlineEditsUnification);
		if (!enabled) {
			this._infoTracer.trace(`Deactivated NES: ${reason}`);
			return;
		}

		this._infoTracer.trace(`Deactivating NES: ${reason}`);
		this._configurationService.setConfig(ConfigKey.Internal.InlineEditsUnification, false).then(
			() => {
				this._infoTracer.trace(`Deactivated NES`);
			},
			(e) => {
				this._errorTracer.trace(`Failed to deactivate NES: ${e}`);
			},
		);
	}

	// Enable FIM completion.
	private activateFIMCompletion(provider: string, modelName: string) {
		this._infoTracer.trace(`Activating the FIM completion with model: ${provider}:${modelName}`);
		Promise.all(
			[
				this._configurationService.setConfig(ConfigKey.Internal.FIMCompletionModelName, `${provider}:${modelName}`),
				this._configurationService.setConfig(ConfigKey.Internal.InlineEditsEnableGhCompletionsProvider, true),
			]
		).then(
			() => this._infoTracer.trace(`Activated the FIM completion with model: ${provider}:${modelName}`),
			(e) => this._errorTracer.trace(`Failed to activate FIM completion with model: ${provider}:${modelName}, error: ${e}`)
		);
	}
}

export class CraftingModelService extends Disposable implements ICraftingModelService {
	private _taskSinger = new TaskSingler<any>();

	private readonly _modelsQuerieddEmitter = this._register(new Emitter<void>());
	readonly onDidModelQueried = this._modelsQuerieddEmitter.event;

	private _models: CraftingModel[] | undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	async getModels(): Promise<CraftingModel[]> {
		if (this._models) {
			return this._models;
		}

		const models = await this._taskSinger.getOrCreate("getModels", () => this.doGetModels());
		this._models = models;
		this._modelsQuerieddEmitter.fire();

		return models;
	}

	private async doGetModels(): Promise<CraftingModel[]> {
		const execAsync = promisify(exec);
		try {
			const { stdout } = await execAsync('cs llm model list -o json');
			const models: CraftingModel[] = JSON.parse(stdout);
			return models;
		} catch (e) {
			this.logService.error(`list model: ${e}`);
			return [];
		}
	}

	get models(): CraftingModel[] | undefined {
		return this._models;
	}
}