/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, languages } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { autorun, observableFromEvent } from '../../../util/vs/base/common/observableInternal';
import { registerUnificationCommands } from '../../completions-core/vscode-node/completionsServiceBridges';
import { ICopilotInlineCompletionItemProviderService } from '../common/copilotInlineCompletionItemProviderService';
import { unificationStateObservable } from './completionsUnificationContribution';
import { CraftingModelPurpose, ICraftingModelService } from '../../crafting/common/types';
import { doUntilSuccess } from '../../../util/common/crafting';
import { ILogService } from '../../../platform/log/common/logService';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';

export class CompletionsCoreContribution extends Disposable {

	private _modelService = this._instanceService.invokeFunction(accessor => accessor.get(ICraftingModelService));
	private readonly _copilotToken = observableFromEvent(this, this.authenticationService.onDidAuthenticationChange, () => this.authenticationService.copilotToken);
	private _registered = false;
	private readonly _purposeModelMap = observableFromEvent(this, this._modelService.onPurposeModelMapChanged, () => this._modelService.purposeModelMap);
	private readonly _fimCompletionEnabled = this._configurationService.getConfigObservable(ConfigKey.FIMCompletionEnabled);

	constructor(
		@ICopilotInlineCompletionItemProviderService _copilotInlineCompletionItemProviderService: ICopilotInlineCompletionItemProviderService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService experimentationService: IExperimentationService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instanceService: IInstantiationService,
	) {
		super();

		const unificationState = unificationStateObservable(this);

		this._register(autorun(reader => {
			const unificationStateValue = unificationState.read(reader);
			const extensionUnification = unificationStateValue?.extensionUnification ?? false;

			if (this._registered) {
				return;
			}
			const configEnabled = this._fimCompletionEnabled.read(reader);
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

			const provider = _copilotInlineCompletionItemProviderService.getOrCreateProvider();
			reader.store.add(
				languages.registerInlineCompletionItemProvider(
					{ pattern: '**' },
					provider,
					{
						debounceDelayMs: 0,
						excludes: ['github.copilot'],
						groupId: 'completions'
					}
				)
			);
			this._logService.info('FIM Completion Provider registered');
			this._registered = true;

			void commands.executeCommand('setContext', 'github.copilot.extensionUnification.activated', extensionUnification);

			if (extensionUnification) {
				const completionsInstaService = _copilotInlineCompletionItemProviderService.getOrCreateInstantiationService();
				reader.store.add(completionsInstaService.invokeFunction(registerUnificationCommands));
			}
		}));

		this._register(autorun(reader => {
			const token = this._copilotToken.read(reader);
			void commands.executeCommand('setContext', 'github.copilot.activated', token !== undefined);
		}));

		doUntilSuccess(() => this._modelService.getModelByPurpose(CraftingModelPurpose.CodingFIM));
	}
}
