export namespace LLMSession {
	export enum Role {
		System = 'SYSTEM',
		User = 'USER',
		Assistant = 'ASSISTANT',
		Tool = 'TOOL'
	}

	export interface Content {
		text?: string;
		parts?: ContentPart[];
	}

	export interface ContentPart {
		mime_type: string;
		data: Uint8Array;
	}

	export interface ToolCall {
		id: string;
		name: string;
		args: string;
	}

	export interface Message {
		id?: string;
		role: Role;
		content?: Content;
		tool_call?: ToolCall;
	}
}