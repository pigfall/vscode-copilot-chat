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
import { CraftingModelPurpose, ICraftingModelService } from '../../crafting/common/types';
import { ILogService } from '../../../platform/log/common/logService';
import { doUntilSuccess } from '../../../util/common/crafting';

export class CompletionsCoreContribution extends Disposable {

	private _provider: CopilotInlineCompletionItemProvider | undefined;
	private _registered = false;

	private readonly _copilotToken = observableFromEvent(this, this.authenticationService.onDidAuthenticationChange, () => this.authenticationService.copilotToken);
	private readonly _purposeModelMap = observableFromEvent(this, this._modelService.onPurposeModelMapChanged, () => this._modelService.purposeModelMap);
	private readonly _fimCompletionEnabled = this._configurationService.getConfigObservable(ConfigKey.FIMCompletionEnabled);

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@ICraftingModelService private readonly _modelService: ICraftingModelService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		// This is the place to register(activate) the FIM completion provider.
		// It will be triggered when:
		// 1. The configuration `ConfigKey.FIMCompletionEnabled` changes.
		//    If user change it from 'false' to 'true', the provider will be registered(if condition met) and do not reload vsocde.
		//    But if user change it from 'true' to 'false', as the provider may have been registered, so it need to reload vscode.
		// 2. The copilot token has been acquired.
		// 3. The crafting models were fetched.
		this._register(autorun(reader => {
			if (this._registered) {
				return;
			}
			const configEnabled = this._fimCompletionEnabled.read(reader);

			// Disable if user explicitly disabled FIM in vscode settings.
			if (!configEnabled) {
				return;
			}

			// Disable if our placeholder copilot token has not been acquired.
			if (!this._copilotToken.read(reader)) {
				return;
			}

			const fimModel = this._purposeModelMap.read(reader).get(CraftingModelPurpose.CodingFIM);
			if (!fimModel) {
				return;
			}

			const provider = this._getOrCreateProvider();
			reader.store.add(languages.registerInlineCompletionItemProvider({ pattern: '**' }, provider, { debounceDelayMs: 0, excludes: ['github.copilot'], groupId: 'completions' }));
			this._logService.info('FIM Completion Provider registered');
			this._registered = true;
		}));

		doUntilSuccess(() => this._modelService.getModelByPurpose(CraftingModelPurpose.CodingFIM));
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
