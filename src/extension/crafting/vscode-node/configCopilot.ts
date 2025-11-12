/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';

// The CraftingConfigCopilotContribution will use IConfigurationService to modify the configuration for copilot.
export class CraftingConfigCopilotContribution extends Disposable {
	constructor(
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
	}
}