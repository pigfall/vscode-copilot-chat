/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { exec } from 'child_process';
import { promisify } from 'util';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ILogService } from '../../../platform/log/common/logService';
import { TaskSingler } from '../../../util/common/taskSingler';
import { Emitter } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { autorun, observableFromEvent } from '../../../util/vs/base/common/observable';
import { CraftingModel, ICraftingModelService } from '../common/llmconfig';

// The CraftingConfigCopilotContribution will use IConfigurationService to modify the configuration for copilot.
export class CraftingConfigCopilotContribution extends Disposable {
	private readonly _models = observableFromEvent(this, this._modelService.onDidModelQueried, () => this._modelService.models);

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ICraftingModelService private readonly _modelService: ICraftingModelService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._logService.debug("CraftingConfigCopilotContribution contributed");
		this._register(autorun((reader) => {
			const models = this._models.read(reader);
			if (models === undefined) {
				setTimeout(() => {
					this._modelService.getModels();
				}, 1000 * 3);
				return;
			}
			// Enable FIM completion if has openai model.
			this.enableFIMCompletionIfHasSupportedModel(models);
		}));
		this._modelService.getModels();
	}

	private enableFIMCompletionIfHasSupportedModel(models: CraftingModel[]) {
		let hasSupportModel: boolean = false;
		for (const model of models) {
			if (model.provider === "openai" && model.name === "gpt-3.5-turbo-instruct") {
				hasSupportModel = true;
				break;
			}
		}
		if (!hasSupportModel) {
			this._configurationService.setConfig(ConfigKey.Internal.InlineEditsEnableGhCompletionsProvider, false);
			return;
		}

		// Enable FIM completion.
		this._configurationService.setConfig(ConfigKey.Internal.InlineEditsEnableGhCompletionsProvider, true);
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