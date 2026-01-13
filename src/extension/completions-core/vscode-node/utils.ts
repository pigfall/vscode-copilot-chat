import { ICraftingModelSelectorService, ICraftingModelService } from '../../crafting/common/llmconfig';

// A simple service container to hold crafting model related services.
export class ServiceContainer {
	constructor(
		readonly modelService: ICraftingModelService,
		readonly modelSelector: ICraftingModelSelectorService,
	) {

	}
}