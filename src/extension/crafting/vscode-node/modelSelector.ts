import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ILogService } from '../../../platform/log/common/logService';
import { CraftingModel } from '../common/llmconfig';

// Select the model according with configuration and crafting model service.
export class CraftingModelSelector {
	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {

	}
	fimModel(allModels: CraftingModel[]): CraftingModel | undefined {
		// Check if FIM completion is enabled.
		if (!this._configurationService.getConfig(ConfigKey.FIMCompletionEnabled)) {
			return undefined;
		}
		// Select the FIM model.
		return this.findModel(this._configurationService.getConfig(ConfigKey.FIMCompletionModelName), 'coding_fim', allModels);
	}
	nesModel(allModels: CraftingModel[]): CraftingModel | undefined {
		// Check if NES completion is enabled.
		if (!this._configurationService.getConfig(ConfigKey.NESCompletionEnabled)) {
			return undefined;
		}
		// Select the NES model.
		return this.findModel(this._configurationService.getConfig(ConfigKey.NESCompletionModelName), 'coding_nes', allModels);
	}

	// Select the model according with client configuration and model purpose.
	// It will choose model with the following priority:
	//  - The user specified model in vscode settings.json.
	//    * Validate the user specified model, if the model is validate(exists in crafting's LLMConfig), use this one.
	//    * If it is invalid, ignore and fallback to purpose selection.
	//  - The first purpose matched model in LLMConfig.models.
	//  - Return undefined if no model is available for FIM completion.
	private findModel(clientConfigurationValue: string | undefined, purpose: string, allModels: CraftingModel[]): CraftingModel | undefined {
		if (clientConfigurationValue) {
			// Check format. `{provider}:{model_name}` | `model_alias`
			const foundModel = this.findClientConfiguredModel(clientConfigurationValue, allModels);
			if (foundModel) {
				return foundModel;
			}
			this._logService.warn(`The configured model '${clientConfigurationValue}' is invalid, fallback to auto selection.`);
		}

		// Find the first model which purpose matched
		return allModels.find((m) => {
			return m.purposes.includes(purpose);
		});
	}

	// In most casee, we auto select the model, the user do not need to specify the model in vscode settings.json.
	// But if user specified the model in vsoce `settings.json`, we parse and find the model.
	private findClientConfiguredModel(value: string, allModels: CraftingModel[]): CraftingModel | undefined {
		const providerAndName = value.split(':', 2);
		if (providerAndName.length === 2) {
			const matched = allModels.find((m) => {
				return m.provider === providerAndName[0] && m.name === providerAndName[1];
			});
			if (matched) {
				return matched;
			}
		}
		// The configuration value is an alias.
		// Find the model with the alias.
		return allModels.find((m) => {
			return m.aliases?.find((alias) => {
				return alias === value;
			}) !== undefined;
		});
	}
}
