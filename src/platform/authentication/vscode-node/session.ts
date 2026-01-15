/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AuthenticationGetSessionOptions, AuthenticationSession, AuthenticationSessionsChangeEvent } from 'vscode';
import { AuthProviderId, ConfigKey, IConfigurationService } from '../../configuration/common/configurationService';

export const SESSION_LOGIN_MESSAGE = 'You are not signed in to GitHub. Please sign in to use Copilot.';
// These types are subsets of the "real" types AuthenticationSessionAccountInformation and
// AuthenticationSession. They allow us to use the type system to validate which fields
// are actually needed and hence which ones need values when we construct fake session.
type CopilotAuthenticationSessionAccountInformation = {
	label: string;
};

export type CopilotAuthenticationSession = {
	accessToken: string;
	account: CopilotAuthenticationSessionAccountInformation;
};

export function authProviderId(configurationService: IConfigurationService): AuthProviderId {
	return (
		configurationService.getConfig(ConfigKey.Shared.AuthProvider) === AuthProviderId.GitHubEnterprise
			? AuthProviderId.GitHubEnterprise
			: AuthProviderId.GitHub
	);
}

/**
 * Cast a wide net to get a session with any of the scopes that Copilot needs.
 * @param configurationService for determining the auth provider
 * @returns an auth session with any of the scopes that Copilot needs, or undefined if none is found
 * @deprecated use `IAuthenticationService` instead
 */
export function getAnyAuthSession(configurationService: IConfigurationService, options?: AuthenticationGetSessionOptions): Promise<AuthenticationSession | undefined> {
	// When getting github authentication,
	// the extension uses the vscode builtin authentication flow.
	// We can not modify the url of the request in this extension.
	// So we do not send the real request, directly mock the response at here.
	return Promise.resolve(
		{
			accessToken: "placeholder",
			account: { id: "placeholder", label: "placeholder" },
			id: "placeholder",
			scopes: [],
		}
	);
}

/**
 * Get a session with an access token that has the same scopes as other GitHub extensions like GitHub Pull Requests.
 * @param configurationService for determining the auth provider
 * @param options what get passed in to getSession
 * @returns an auth session with a token with the aligned scopes, or undefined if none is found
 * @deprecated use `IAuthenticationService` instead
 */
export function getAlignedSession(configurationService: IConfigurationService, options: AuthenticationGetSessionOptions): Promise<AuthenticationSession | undefined> {
	throw new Error('Not support github login');
}

export function authChangeAffectsCopilot(event: AuthenticationSessionsChangeEvent, configurationService: IConfigurationService): boolean {
	const provider = event.provider;
	const providerId = authProviderId(configurationService);
	return provider.id === providerId;
}
