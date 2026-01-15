/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { languages } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { autorun, observableFromEvent } from '../../../util/vs/base/common/observableInternal';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { createContext, setup } from '../../completions-core/vscode-node/completionsServiceBridges';
import { CopilotInlineCompletionItemProvider } from '../../completions-core/vscode-node/extension/src/inlineCompletion';
import { ICraftingModelSelectorService, ICraftingModelService } from '../../crafting/common/llmconfig';
import { ILogService } from '../../../platform/log/common/logService';

export class CompletionsCoreContribution extends Disposable {

	private _provider: CopilotInlineCompletionItemProvider | undefined;

	private readonly _copilotToken = observableFromEvent(this, this.authenticationService.onDidAuthenticationChange, () => this.authenticationService.copilotToken);
	private readonly _models = observableFromEvent(this, this._modelService.onDidModelQueried, () => this._modelService.models);

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@ICraftingModelService private readonly _modelService: ICraftingModelService,
		@ICraftingModelSelectorService private readonly _modelSelector: ICraftingModelSelectorService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		// This is the palce to register(activate) the FIM completion provider.
		// It will be trigger when:
		// 1. The configuration "crafting.fimCompletionEnabled" changes.
		//    So if user change it from 'false' to 'true', the provider will be registered(if condition met) and do not reload vsocde.
		//    But if user change it from 'true' to 'false', as the provider may have been registered, so it need to reload vscode.
		// 2. The copilot token has been acquired.
		// 3. The crafting models were fetched.
		this._register(autorun(reader => {
			const configEnabled = configurationService.getConfig(ConfigKey.FIMCompletionEnabled);

			// Disable if user explicitly disabled FIM in vscode settings.
			if (!configEnabled) {
				return;
			}

			// Disable if our placholder copilot token has not been acquired.
			if (!this._copilotToken.read(reader)) {
				return;
			}

			const models = this._models.read(reader);
			// Disable if no FIM model is available.
			if (!this._modelSelector.fimModel(models || [])) {
				return;
			}

			const provider = this._getOrCreateProvider();
			reader.store.add(languages.registerInlineCompletionItemProvider({ pattern: '**' }, provider, { debounceDelayMs: 0, excludes: ['github.copilot'], groupId: 'completions' }));
			this._logService.info('FIM Completion Provider registered');
		}));
	}

	private _getOrCreateProvider() {
		if (!this._provider) {
			const ctx = this._instantiationService.invokeFunction(createContext);
			this._register(setup(ctx));
			this._provider = this._register(new CopilotInlineCompletionItemProvider(ctx));
		}
		return this._provider;
	}
}
