import { ICraftingModelService } from '../../crafting/common/types';

// A simple service container to hold crafting model related services.
export class ServiceContainer {
	constructor(
		readonly modelService: ICraftingModelService,
	) {

	}
}