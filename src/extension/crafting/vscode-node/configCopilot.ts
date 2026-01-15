import * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ILogService } from '../../../platform/log/common/logService';
import { createTracer, ITracer } from '../../../util/common/tracing';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { autorun, observableFromEvent } from '../../../util/vs/base/common/observable';
import { CraftingModel, ICraftingModelSelectorService, ICraftingModelService } from '../common/llmconfig';

// The CraftingConfigCopilotContribution will use IConfigurationService to modify the configuration(vscode setting.json) for copilot.
// It only modify the configuration(vscode setting.json), do not activate any copilot feature.
export class CraftingConfigCopilotContribution extends Disposable {
	private readonly _models = observableFromEvent(this, this._modelService.onDidModelQueried, () => this._modelService.models);
	private readonly _infoTracer: ITracer;
	private readonly _errorTracer: ITracer;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ICraftingModelService private readonly _modelService: ICraftingModelService,
		@ICraftingModelSelectorService private readonly _modelSelector: ICraftingModelSelectorService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._infoTracer = createTracer(['crafting'], (msg) => this._logService.info(msg));
		this._errorTracer = createTracer(['crafting'], (msg) => this._logService.error(msg));

		this._infoTracer.trace("CraftingConfigCopilotContribution contributed");
		this._register(autorun((reader) => {
			const models = this._models.read(reader);
			if (models === undefined) { // models is undefined means we failed to fetch models or not fetched yet. Set a timer to retry.
				setTimeout(() => {
					this._modelService.getModels();
				}, 1000 * 3);
				return;
			}
			// Trigger to refresh the model list which is showed in chat pannel model picker.
			vscode.lm.selectChatModels();
			// Sync Next Edit Suggestion Model.
			this.syncNextEditSuggestionModel(models);
		}));
		this._modelService.getModels();
	}

	// The final NES model used is stored in ConfigKey.Internal.InlineEditsXtabProviderModelName.
	// We configure it here according to user configuration and fetched models.
	private syncNextEditSuggestionModel(models: CraftingModel[]) {
		const enabled = this._configurationService.getConfig(ConfigKey.NESCompletionEnabled);
		if (!enabled) {
			this._infoTracer.trace(`NES completion is disabled`);
			return;
		}
		// auto select a NES model according with user configuration and fetched models.
		const model = this._modelSelector.nesModel(models);
		if (!model) {
			this._infoTracer.trace(`NES completion is disabled becuase of no available models`);
			return;
		}
		this._configurationService.setConfig(ConfigKey.Internal.InlineEditsXtabProviderModelName, model).then(
			() => {
				this._infoTracer.trace(`Use ${model} as next edit suggestion model`);
			},
			(e) => {
				this._errorTracer.trace(`Failed to set ${model} as next edit suggestion model: ${e}`);
			},
		);
	}
}
