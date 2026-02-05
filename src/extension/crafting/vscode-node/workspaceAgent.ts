import * as cp from 'child_process';
import * as vscode from 'vscode';
import { IExtensionContribution } from '../../common/contributions';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ILogService } from '../../../platform/log/common/logService';
import { AgentMsgType, MsgAppend, MsgStart, RawMsg, Role } from '../common/agentMessages';
import * as readline from 'readline';

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
	): Promise<void> {
		return new WorkspaceAgentRequestHandler(this.logService).handle(request, context, stream, token);
	}
}

class WorkspaceAgentRequestHandler {
	toolCallings = new Map<string, () => void>();
	constructor(
		readonly logService: ILogService,
	) {

	}

	// Handle the vscode chat request. Render the response to chat panel.
	handle(
		request: vscode.ChatRequest,
		context: vscode.ChatContext,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken
	): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this.logService.info(`WorkspaceAgent received request: ${request.prompt}`);
			const child: cp.ChildProcessWithoutNullStreams = cp.spawn('/opt/sandboxd/sbin/wsenv', ['agent', 'run'], {
				stdio: 'pipe',
				env: { ...process.env },
			});

			child.stdout.setEncoding('utf8');
			const rl = readline.createInterface({
				input: child.stdout,
				crlfDelay: Infinity // Recognize all instances of CR LF (\r\n) as a single line break
			});

			rl.on('line', (line) => {
				try {
					this.logService.info(`WorkspaceAgent received line: ${line}`);
					const rawMsg: RawMsg = JSON.parse(line);
					this.renderRawMessage(stream, rawMsg);
				} catch (error) {
					this.logService.error(`Failed to decode line to RawMsg: ${error.message}`);
				}
			});

			child.stderr.setEncoding('utf8');
			child.stderr.on('data', (data) => {
				this.logService.error(`WorkspaceAgent stderr: ${data}`);
			});

			const cancellationHandler = token.onCancellationRequested(() => {
				child.kill('SIGTERM');
			});

			child.on('error', (error) => {
				this.logService.error(`WorkspaceAgent error: ${error.message}`);
				cancellationHandler.dispose();
				reject(error);
			});

			child.on('close', (code) => {
				this.logService.info(`WorkspaceAgent process exited with code: ${code}`);
				if (code !== 0) {
					reject(new Error(`WorkspaceAgent process exited with code: ${code}`));
					return;
				}
				cancellationHandler.dispose();
				resolve();
				rl.close();
			});

			const msgStart: MsgStart = {
				cid: "todo",
				agent: 'workspace',
				conv: {
					messages: [{ role: Role.User, content: { text: request.prompt } }]
				}
			};
			const rawMsg: RawMsg = {
				t: AgentMsgType.Start,
				p: msgStart
			};
			this.logService.info(`WorkspaceAgent sending message: ${JSON.stringify(rawMsg)}`);

			child.stdin.write(JSON.stringify(rawMsg) + '\n');
			// child.stdin.end();
		});

	}

	// Render the raw message to vscode chat pannel.
	renderRawMessage(render: vscode.ChatResponseStream, rawMsg: RawMsg) {
		switch (rawMsg.t) {
			case (AgentMsgType.Append): {
				this.renderAppendMessage(render, rawMsg.p as MsgAppend);
				break;
			}
			default:
				this.logService.warn(`WorkspaceAgent received unknown message type: ${rawMsg.t}`);
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
			// For each message, start with a new line.
			render.markdown('\n');
			if (msgAppend.msg.role === Role.Assistant && msgAppend.msg.content) {
				render.markdown(msgAppend.msg.content.text || '');
				return;
			}

			if (msgAppend.msg.role === Role.Assistant && msgAppend.msg.tool_call) {
				this.logService.debug(`WorkspaceAgent received tool call: ${msgAppend.msg.tool_call.name}`);
				render.progress(msgAppend.msg.tool_call.name, async (progress) => {
					return new Promise<void>((resolve) => {
						this.toolCallings.set(msgAppend.msg?.tool_call?.id || '', () => {
							resolve();
						});
					});
				});
				return;
			}

			// TODO handle tool call error.
			if (msgAppend.msg.role === Role.Tool) {
				this.logService.debug(`WorkspaceAgent received tool call finished`);
				this.toolCallings.get(msgAppend.msg.tool_call_id || '')?.();
			}

			return;
		}

		if (msgAppend.cnt && msgAppend.cnt.text) {
			render.markdown(msgAppend.cnt.text);
		}

		this.logService.warn(`empty append message received`);
	}
}