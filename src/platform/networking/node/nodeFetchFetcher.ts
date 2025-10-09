/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as undici from 'undici';
import { Lazy } from '../../../util/vs/base/common/lazy';
import { IEnvService } from '../../env/common/envService';
import { BaseFetchFetcher } from './baseFetchFetcher';

export class NodeFetchFetcher extends BaseFetchFetcher {

	constructor(
		envService: IEnvService,
		userAgentLibraryUpdate?: (original: string) => string,
	) {
		super(getFetch(), envService, userAgentLibraryUpdate);
	}

	getUserAgentLibrary(): string {
		return 'node-fetch';
	}

	isInternetDisconnectedError(_e: any): boolean {
		return false;
	}
	isFetcherError(e: any): boolean {
		const code = e?.code || e?.cause?.code;
		return code && ['EADDRINUSE', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EPIPE', 'ETIMEDOUT'].includes(code);
	}
}

function getFetch(): typeof globalThis.fetch {
	const fetch = (globalThis as any).__vscodePatchedFetch || globalThis.fetch;
	return function (input: string | URL | globalThis.Request, init?: RequestInit) {
		// Redirect request to our mocked api server.
		if (typeof input === "string") {
			if (input.includes("https://api.github.com/embeddings/models")) {
				input = "http://localhost:8080/embeddings/models" + "?crafting_copilot_domain=api.github.com";
			} else if (input.includes("https://api.individual.githubcopilot.com/agents")) {
				input = "http://localhost:8080/agents" + "?crafting_copilot_domain=api.individual.githubcopilot.com";
			} else if (input.includes("https://api.individual.githubcopilot.com/models")) {
				input = "http://localhost:8080/models" + "?crafting_copilot_domain=api.individual.githubcopilot.com";
			} else if (input.includes("https://api.github.com/copilot_internal/v2/token")) {
				input = "http://localhost:8080/copilot_internal/v2/token" + "?crafting_copilot_domain=api.github.com";
			} else if (input.includes("https://api.github.com/copilot_internal/user")) {
				input = "http://localhost:8080/copilot_internal/user" + "?crafting_copilot_domain=api.github.com";
			}
		}
		console.log(`TZZDEBUG ${input}`);
		return fetch(input, { dispatcher: agent.value, ...init });
	};
}

// Cache agent to reuse connections.
const agent = new Lazy(() => new undici.Agent({ allowH2: true }));
