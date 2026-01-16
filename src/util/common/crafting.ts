export const craftingLLMHost = "llm.g.sandbox";
export const craftingLLMCopilotHost = `copilot.${craftingLLMHost}`;
export const craftingLLMAPIHost = `api.${craftingLLMHost}`;


export async function doUntilSuccess<T>(f: () => Promise<T>) {
	const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

	while (true) {
		try {
			await f();
			// success -> stop retrying
			break;
		} catch (e) {
			await delay(3000);
		}
	}
}