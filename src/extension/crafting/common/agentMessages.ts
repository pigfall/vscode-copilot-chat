// Msg type names.
export enum AgentMsgType {
	Error = "error",
	Start = "start",
	End = "end",
	Append = "append",
	StateGet = "state-get",
	StateSet = "state-set"
}

export interface RawMsg {
	ID?: string;
	// type.
	t: AgentMsgType;
	// payload.
	p?: any;
}

export interface MsgStart {
	/**
	 * Name of the agent.
	 */
	agent: string;

	/**
	 * The initial conversation.
	 */
	conv?: SamplerConversation;

	/**
	 * The context ID.
	 */
	cid?: string;

	/**
	 * The agents can be handoff back to.
	 */
	handoffs?: HandoffAgent[];
}

export interface MsgAppend {
	// message.
	msg?: SamplerMessage;
	// content.
	cnt?: SamplerContent;
}

export interface HandoffAgent {
	/**
	 * Name of the handoff agent.
	 */
	name: string;

	/**
	 * Description of the handoff agent.
	 */
	description: string;

	/**
	 * Indicates if the task is summarized.
	 */
	summarizedTask?: boolean;
}

// TypeScript equivalent of the Conversation type from sampler package
export interface SamplerConversation {
	messages?: SamplerMessage[];
	tools?: ToolDef[];
}

export interface SamplerMessage {
	role?: Role;
	content?: SamplerContent;
	tool_call?: ToolCall;
	tool_call_id?: string;
}

export enum Role {
	System = 'system',
	User = 'user',
	Assistant = 'assistant',
	Tool = 'tool'
}

export interface SamplerContent {
	text?: string;
}

export interface ToolDef {
	name: string;
	description: string;
	parameters?: Schema;
	policy?: Policy;
}

export interface Schema {
	type: string;
	description?: string;
	properties?: Record<string, any>;
	required?: string[];
	items?: Schema;
}

export interface Policy {
	approvalClasses?: string[];
}

export interface ToolCall {
	id?: string;
	name: string;
	args?: Record<string, ArgValue>;
}

export type ArgValue = any;