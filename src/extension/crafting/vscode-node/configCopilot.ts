import { exec } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ILogService } from '../../../platform/log/common/logService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
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
		@IExperimentationService private readonly _expService: IExperimentationService,
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
			// Configure FIM completion.
			this.configureFIMCompletion(models);
			// Configure Next Edit Suggestion.
			this.configureNextEditSuggestion(models);
		}));
		this._modelService.getModels();
	}

	// Configure Next Edit Suggestion.
	private configureNextEditSuggestion(models: CraftingModel[]) {
		const enabled = this._configurationService.getExperimentBasedConfig(ConfigKey.InlineEditsEnabled, this._expService);
		if (!enabled) {
			this._infoTracer.trace(`Next edit suggestion is disabled`);
			return;
		}

		if (models.length === 0) {
			this._infoTracer.trace(`No models are available for next edit suggestion`);
			this.configureNextEditSuggestionModel(undefined);
			return;
		}

		let model: CraftingModel | undefined;
		const specifiedModel = this._configurationService.getConfig(ConfigKey.Internal.InlineEditsXtabProviderModelName);
		if (specifiedModel) {
			const providerAndModelName = specifiedModel.split(':', 2);
			if (providerAndModelName.length === 2) {
				model = models.find((m) => {
					return m.provider === providerAndModelName[0] && m.name === providerAndModelName[1];
				});
			}
		}
		if (!model) {
			model = models[0];
		}
		const nesURL = `http://${craftingLLMAPIHost}/chat/completions`;
		this._configurationService.setConfig(ConfigKey.Internal.InlineEditsXtabProviderUrl, nesURL).then(
			() => {
				this.configureNextEditSuggestionModel(model);
			},
			(e) => {
				this._errorTracer.trace(`Failed to set xtab provider url: ${e}`);
			},
		);
	}

	private configureNextEditSuggestionModel(model: CraftingModel | undefined) {
		let value = "";
		if (model) {
			value = `${model.provider}:${model.name}`;
		}
		this._configurationService.setConfig(ConfigKey.Internal.InlineEditsXtabProviderModelName, value).then(
			() => {
				this._infoTracer.trace(`Use ${value} as next edit suggestion model`);
			},
			(e) => {
				this._errorTracer.trace(`Failed to set ${value} as next edit suggestion model: ${e}`);
			}
		);

	}


	// Configure FIM Completion.
	private configureFIMCompletion(models: CraftingModel[]) {
		const enabled = this._configurationService.getConfig(ConfigKey.Internal.FIMCompletionEnabled);
		if (!enabled) {
			this._infoTracer.trace(`FIM completion is disabled`);
			return;
		}

		if (!models || models.length === 0) {
			this._infoTracer.trace(`No models are available for FIM completion`);
			this.configureFIMCompletionModel(undefined);
			return;
		}
		const configurationModel = this._configurationService.getConfig(ConfigKey.Internal.FIMCompletionModelName);
		if (configurationModel === undefined || configurationModel === "") {
			// Auto select a FIM completion model.
			this.autoSelectFIMCompletionModel(models);
			return;
		}

		// User configed the FIM model, check if the models exists, if not, auto select a model.
		const providerAndModel = configurationModel.split(":", 2);
		if (providerAndModel.length !== 2) {
			// Deactivate the FIM completion because the the model specified by user is invalid.
			this._errorTracer.trace(`invalid FIM completion model config: ${configurationModel}`);
			this.configureFIMCompletionModel(undefined);
			return;
		}
		const configurationModelObject = models.find((model) => {
			return model.provider === providerAndModel[0] && model.name === providerAndModel[1];
		});
		if (configurationModelObject === undefined) {
			this._infoTracer.trace(`User specified FIM completion model (${configurationModel}) not found in available models, auto-selecting a supported model.`);
			// The model specified by user is not found. Auto choose an another model.
			this.autoSelectFIMCompletionModel(models);
			return;
		}

		// Activate the FIM completion with the user-specified model.
		this.configureFIMCompletionModel(configurationModelObject);
	}

	private autoSelectFIMCompletionModel(models: CraftingModel[]) {
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

		this.configureFIMCompletionModel(fimModel);
		return;
	}

	private configureFIMCompletionModel(model: CraftingModel | undefined) {
		let value = "";
		if (model) {
			value = `${model.provider}:${model.name}`;
		}
		this._configurationService.setConfig(ConfigKey.Internal.FIMCompletionModelName, value).then(
			() => {
				this._infoTracer.trace(`Use ${value} as FIM completion model`);
			},
			(e) => {
				this._errorTracer.trace(`Failed to set ${value} as FIM completion model: ${e}`);
			}
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