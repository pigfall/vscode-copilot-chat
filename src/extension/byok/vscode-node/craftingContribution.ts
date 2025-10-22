/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { lm } from 'vscode';
// import { ILogService } from '../../../platform/log/common/logService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { IExtensionContribution } from '../../common/contributions';
import { CraftingModelProvider } from './craftingLMProvider';

export class CraftingContrib extends Disposable implements IExtensionContribution {
	constructor(
		//@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
		this.registerModelProvider();
	}

	private registerModelProvider() {
		const provider = this._instantiationService.createInstance(CraftingModelProvider);
		lm.registerLanguageModelChatProvider("crafting", provider);
	}
}