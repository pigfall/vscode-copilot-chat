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

export interface ListCraftingModelResponse {
	data: CraftingModel[];
}

export interface CraftingModel {
	id: string;
	extra?: {
		dialect?: {
			model_class?: string;
			sub_class?: string;
		};
		properties?: {
			context_window_limit?: number;
		};
		aliases?: string[];
		purposes?: string[];
	};
}


export enum CraftingModelPurpose {
	Generic = 'GENERIC',
	Coding = 'CODING',
	CodingFIM = 'CODING_FIM',
	CodingNES = 'CODING_NES',
}

export const isCraftingModelPurpose = (v: unknown): v is CraftingModelPurpose => {
	return typeof v === 'string' && (Object.values(CraftingModelPurpose) as string[]).includes(v);
};