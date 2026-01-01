import { createServiceIdentifier } from '../../../util/common/services';
import { Event } from '../../../util/vs/base/common/event';

export const ICraftingModelService = createServiceIdentifier<ICraftingModelService>('ICraftingModelService');

export interface ICraftingModelService {
	readonly onDidModelQueried: Event<void>;
	getModels(): Promise<CraftingModel[]>;
	readonly models: CraftingModel[] | undefined;
}

// The output of: `wsenv env setup`.
export interface AgentSetup {
	llm_config?: LLMConfig;
}

export interface LLMConfig {
	models?: CraftingModel[];
}

export interface CraftingModel {
	provider: string;
	name: string;
	purposes: string[];
	dialect?: {
		source?: string;
		model_class?: string;
		sub_class?: string;
	};
}