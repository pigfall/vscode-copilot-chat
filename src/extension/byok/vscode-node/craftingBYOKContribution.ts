/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { lm } from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { IExtensionContribution } from '../../common/contributions';
import { ICraftingModelService } from '../../crafting/common/llmconfig';
import { CraftingModelProvider } from './craftingProvider';

export class CraftingBYOKContrib extends Disposable implements IExtensionContribution {
	constructor(
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ICraftingModelService private readonly _lmconfigs: ICraftingModelService,
	) {
		super();
		this.registerModelProvider();
	}

	private registerModelProvider() {
		this._logService.info('Crafting Model Provider was regestred!');
		const provider = this._instantiationService.createInstance(CraftingModelProvider, this._lmconfigs);
		lm.registerLanguageModelChatProvider("crafting", provider);
	}
}