import * as vscode from 'vscode';
import { lm } from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { IExtensionContribution } from '../../common/contributions';
import { ICraftingModelService } from '../../crafting/common/llmconfig';
import { CraftingModelProvider } from './craftingProvider';

// The CraftingBYOKContrib regiters the crafting model provider to vscode.
export class CraftingBYOKContrib extends Disposable implements IExtensionContribution {
	constructor(
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ICraftingModelService private readonly _lmconfigs: ICraftingModelService,
	) {
		super();
		this.registerModelProvider();
		// Trigger to refresh the model list which is showed in chat pannel model picker.
		vscode.lm.selectChatModels();
	}

	private registerModelProvider() {
		const provider = this._instantiationService.createInstance(CraftingModelProvider, this._lmconfigs);
		lm.registerLanguageModelChatProvider("crafting", provider);
		this._logService.info('Crafting Model Provider was registered!');
	}
}