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
	fimModel(allModels: CraftingModel[]): CraftingModelVarient | undefined;
	nesModel(allModels: CraftingModel[]): CraftingModelVarient | undefined;
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

export type CraftingModelAlias = string;
export type CraftingModelId = `${string}:${string}`;
export enum CraftingModelPurpose {
	Generic = 'GENERIC',
	Coding = 'CODING',
	CodingFIM = 'CODING_FIM',
	CodingNES = 'CODING_NES',
}

// This is a model name that should be used in call chat request.
export type CraftingModelVarient = CraftingModelId | CraftingModelAlias | CraftingModelPurpose;

// Get the model id in format `{provider}:{model_name}` from CraftingModel.
export function craftingModelIdFrom(model: CraftingModel): CraftingModelId {
	return `${model.provider}:${model.name}`;
}