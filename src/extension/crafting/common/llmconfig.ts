// This file defines the interfaces and types for Crafting LLM configuration.

import type { LanguageModelChatInformation } from 'vscode';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { createServiceIdentifier } from '../../../util/common/services';
import { Event } from '../../../util/vs/base/common/event';

export const ICraftingModelService = createServiceIdentifier<ICraftingModelService>('ICraftingModelService');

export interface ICraftingModelService {
	readonly onModelsChanged: Event<void>;
	getModels(): Promise<CraftingModel[]>;
	readonly models: CraftingModel[] | undefined;
	getModelByPurpose(purpose: CraftingModelPurpose, ignoreCache?: boolean): Promise<CraftingModel | null>;
	readonly purposeModelMap: Map<CraftingModelPurpose, CraftingModel>;
	readonly onPurposeModelMapChanged: Event<void>;
	lastUsedChatEndpoint(): IChatEndpoint | undefined;
	getOrCreateChatEndpoint(model: CraftingModel): IChatEndpoint;
	toLanguageModelChatInformation(model: CraftingModel, isDefault: boolean): LanguageModelChatInformation;
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

export enum CraftingModelPurpose {
	Generic = 'GENERIC',
	Coding = 'CODING',
	CodingFIM = 'CODING_FIM',
	CodingNES = 'CODING_NES',
}


// Get the model id in format `{provider}:{model_name}` from CraftingModel.
export function craftingModelIdFrom(model: CraftingModel): string {
	return `${model.provider}:${model.name}`;
}