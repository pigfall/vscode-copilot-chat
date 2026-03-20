import * as vscode from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { IExtensionContribution } from '../../common/contributions';
import { ICraftingModelService } from '../../crafting/common/types';
import { CraftingModelProvider } from './modelProvider';
import { autorun, observableFromEvent } from '../../../util/vs/base/common/observable';
import { doUntilSuccess } from '../../../util/common/crafting';
import { WorkspaceAgent } from './workspaceAgent';

// The CraftingModelContrib registers the crafting model provider to vscode.
class CraftingModelContrib extends Disposable implements IExtensionContribution {

	private readonly _models = observableFromEvent(this, this._modelService.onModelsChanged, () => this._modelService.models);

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ICraftingModelService private readonly _modelService: ICraftingModelService,
	) {
		super();

		this._register(autorun((reader) => {
			const models = this._models.read(reader);
			if (models === undefined) { // models are undefined means we failed to fetch models or not fetched yet.
				return;
			}
			// Trigger to refresh the model list which is showed in chat pannel model picker.
			vscode.lm.selectChatModels();
		}));

		this.registerModelProvider();
		doUntilSuccess(() => this._modelService.getModels());
	}

	private registerModelProvider() {
		const provider = this._instantiationService.createInstance(CraftingModelProvider, this._modelService);
		vscode.lm.registerLanguageModelChatProvider('crafting', provider);
		this._logService.info('Crafting Model Provider was registered!');
	}
}

// Register the WorkspaceAgent as a chat participant in VS Code.
class CraftingWorkspaceAgentContrib extends Disposable implements IExtensionContribution {
	static readonly ID = 'crafting.sandbox.workspace';
	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.registerWorkspaceAgent();
	}

	private registerWorkspaceAgent() {
		const agent = this.instantiationService.createInstance(WorkspaceAgent);
		vscode.chat.createChatParticipant(CraftingWorkspaceAgentContrib.ID, agent.chatRequestHandler.bind(agent));
	}
}

export { CraftingModelContrib, CraftingWorkspaceAgentContrib };