import * as cp from 'child_process';
import * as vscode from 'vscode';
import { IExtensionContribution } from '../../common/contributions';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ILogService } from '../../../platform/log/common/logService';
import { AgentMsgType, MsgAppend, MsgStart, RawMsg, Role, SamplerMessage } from '../common/agentMessages';
import * as readline from 'readline';

// Registers the WorkspaceAgent as a chat participant in VS Code.
export class WorkspaceAgentContrib extends Disposable implements IExtensionContribution {
	static readonly ID = 'crafting.sandbox.workspace';
	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.registerWorkspaceAgent();
	}

	private registerWorkspaceAgent() {
		const agent = this.instantiationService.createInstance(WorkspaceAgent);
		vscode.chat.createChatParticipant(WorkspaceAgentContrib.ID, agent.chatRequestHandler.bind(agent));
	}
}

// WorkspaceAgent is responsible for handling chat requests for the workspace agent participant.
// It delegates incoming chat requests to WorkspaceAgentRequestHandler.
export class WorkspaceAgent {
	constructor(
		@ILogService private readonly logService: ILogService
	) {

	}

	chatRequestHandler(
		request: vscode.ChatRequest,
		context: vscode.ChatContext,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken
	): Promise<vscode.ChatResult> {
		return new WorkspaceAgentRequestHandler(this.logService).handle(request, context, stream, token);
	}
}

class WorkspaceAgentRequestHandler {
	toolCallings = new Map<string, () => void>();
	// Record the messages output from agent in this turn.
	msgs: MsgAppend[] = [];
	constructor(
		readonly logService: ILogService,
	) {

	}

	// Handle the vscode chat request. Render the response to chat panel.
	// It will retrieve the conversation history from context, and send it to agent as the initial conversation.
	// Then it will keep listening on the stdout of the agent process, and render the message to chat panel once it receives a new message.
	handle(
		request: vscode.ChatRequest,
		context: vscode.ChatContext,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken
	): Promise<vscode.ChatResult> {
		return new Promise<vscode.ChatResult>((resolve, reject) => {
			this.logService.debug(`WorkspaceAgent received user prompt: ${request.prompt}`);
			const child: cp.ChildProcessWithoutNullStreams = cp.spawn('/opt/sandboxd/sbin/wsenv', ['agent', 'run'], {
				stdio: 'pipe',
				env: { ...process.env },
			});

			child.stdout.setEncoding('utf8');
			const rl = readline.createInterface({
				input: child.stdout,
				crlfDelay: Infinity // Recognize all instances of CR LF (\r\n) as a single line break
			});

			// Read the stdout of the agent line by line, and render the message to chat panel once it receives a new message.
			rl.on('line', (line) => {
				try {
					this.logService.debug(`WorkspaceAgent received agent output: ${line}`);
					const rawMsg: RawMsg = JSON.parse(line);
					this.handleRawMessage(stream, rawMsg, reject);
				} catch (error) {
					this.logService.error(`Failed to decode agent's output to RawMsg: ${error.message}`);
				}
			});

			// Read the stderr of the agent, and log it.
			child.stderr.setEncoding('utf8');
			child.stderr.on('data', (data) => {
				this.logService.error(`error from agent's stderr: ${data}`);
			});

			const cancellationHandler = token.onCancellationRequested(() => {
				this.logService.debug(`Chat request cancelled, killing the agent process.`);
				child.kill('SIGTERM');
			});

			child.on('error', (error) => {
				this.logService.error(`WorkspaceAgent error: ${error.message}`);
				cancellationHandler.dispose();
				reject(error);
			});

			child.on('close', (code) => {
				this.logService.debug(`agent process exited with code: ${code}`);
				if (code !== 0) {
					reject(new Error(`agent process exited with code: ${code}`));
					return;
				}
				cancellationHandler.dispose();
				// Save the messages to metadata of the chat result, so we could retrieve it in the follow-up conversation.
				resolve({ metadata: { 'msgs': JSON.stringify(this.msgs) } });
				rl.close();
			});

			const rawMsg: RawMsg = {
				t: AgentMsgType.Start,
				p: this.buildStartMsg(request, context),
			};
			this.logService.debug(`send message to agent: ${JSON.stringify(rawMsg)}`);

			child.stdin.write(JSON.stringify(rawMsg) + '\n');
		});
	}

	// Build the start message to agent. It contains the conversation history and the new prompt.
	buildStartMsg(request: vscode.ChatRequest, context: vscode.ChatContext): MsgStart {
		const messages: SamplerMessage[] = [];
		// retrive the messages from history.
		context.history.forEach((msg) => {
			if (msg instanceof vscode.ChatRequestTurn) {
				messages.push({
					role: Role.User,
					content: {
						text: msg.prompt
					}
				});
				return;
			}

			if (msg instanceof vscode.ChatResponseTurn) {
				if (msg.result?.metadata && msg.result.metadata['msgs']) {
					JSON.parse(msg.result.metadata['msgs']).forEach((m: MsgAppend) => {
						m.msg && messages.push(m.msg);
					});
				}
				return;
			}
		});

		// Push the new prompt.
		messages.push({
			role: Role.User,
			content: {
				text: request.prompt
			}
		});

		return {
			cid: request.id,
			agent: 'workspace',
			conv: {
				messages
			}
		};
	}

	// Handle the raw message.
	handleRawMessage(render: vscode.ChatResponseStream, rawMsg: RawMsg, reject: (reason?: any) => void) {
		switch (rawMsg.t) {
			case (AgentMsgType.Append): {
				this.renderAppendMessage(render, rawMsg.p as MsgAppend);
				break;
			}
			case (AgentMsgType.Error): {
				this.logService.error(`error message received from agent: ${JSON.stringify(rawMsg.p)}`);
				reject(new Error(rawMsg.p || 'unknown error from agent'));
				break;
			}
			case (AgentMsgType.End): {
				this.logService.debug(`end message received from agent, conversation ended.`);
				// Do nothing, just wait for the agent process to exit and resolve the chat result in the close event handler.
				break;
			}
			case (AgentMsgType.StateGet): {
				this.logService.debug(`state-get message received from agent: ${rawMsg.p}`);
				break;
			}
			case (AgentMsgType.StateSet): {
				this.logService.debug(`state-set message received from agent: ${rawMsg.p}`);
				break;
			}

			default: {
				this.logService.warn(`WorkspaceAgent received unknown message type: ${rawMsg.t}`);
			}
		}
	}

	// Render the append message to vscode chat pannel.
	renderAppendMessage(render: vscode.ChatResponseStream, msgAppend: MsgAppend) {
		if (msgAppend.msg) {
			if (msgAppend.msg.role === Role.User) {
				// The chat response should not contain user messages. Ignore it.
				this.logService.warn(`WorkspaceAgent received user message in append: ${JSON.stringify(msgAppend.msg)}`);
				return;
			}
			this.msgs.push(msgAppend);
			if (msgAppend.msg.role === Role.Assistant && msgAppend.msg.content) {
				render.markdown(msgAppend.msg.content.text || '');
				return;
			}

			if (msgAppend.msg.role === Role.Assistant && msgAppend.msg.tool_call) {
				this.logService.debug(`WorkspaceAgent received tool call: ${msgAppend.msg.tool_call.name}`);
				render.progress(msgAppend.msg.tool_call.name, async (_progress) => {
					return new Promise<void>((resolve) => {
						this.toolCallings.set(msgAppend.msg?.tool_call?.id || '', () => {
							resolve();
						});
					});
				});
				return;
			}

			if (msgAppend.msg.role === Role.Tool) {
				this.logService.debug(`WorkspaceAgent received tool call result`);
				this.toolCallings.get(msgAppend.msg.tool_call_id || '')?.();
			}

			return;
		}

		if (msgAppend.cnt && msgAppend.cnt.text) {
			// Get the last message from this.msgs
			const latestMsg = this.msgs[this.msgs.length - 1];
			if (latestMsg.msg?.content) {
				latestMsg.msg.content.text = (latestMsg.msg.content.text || '') + msgAppend.cnt.text;
			}
			render.markdown(msgAppend.cnt.text);
		}

		this.logService.warn(`empty append message received`);
	}
}
