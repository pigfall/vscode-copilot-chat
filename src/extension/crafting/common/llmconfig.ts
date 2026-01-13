import type { LanguageModelChatInformation } from 'vscode';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { createServiceIdentifier } from '../../../util/common/services';
import { Event } from '../../../util/vs/base/common/event';

export const ICraftingModelService = createServiceIdentifier<ICraftingModelService>('ICraftingModelService');
export const ICraftingModelSelectorService = createServiceIdentifier<ICraftingModelSelectorService>('ICraftingModelSelectorService');

export interface ICraftingModelService {
	readonly onDidModelQueried: Event<void>;
	getModels(): Promise<CraftingModel[]>;
	readonly models: CraftingModel[] | undefined;
	lastUsedChatEndpoint(): IChatEndpoint | undefined;
	getOrCreateChatEndpoint(model: CraftingModel): IChatEndpoint;
	toLanguageModelChatInformation(model: CraftingModel, isDefault: boolean): LanguageModelChatInformation;
}

export interface ICraftingModelSelectorService {
	fimModel(allModels: CraftingModel[]): CraftingModel | undefined;
	nesModel(allModels: CraftingModel[]): CraftingModel | undefined;
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
	aliases?: string[];
}