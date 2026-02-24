import * as cp from 'child_process';
import * as vscode from 'vscode';
import { IExtensionContribution } from '../../common/contributions';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ILogService } from '../../../platform/log/common/logService';
import * as readline from 'readline';
import { LLMSession } from '../common/llmSession';

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
	constructor(
		readonly logService: ILogService,
	) {

	}

	// Handle the vscode chat request. Render the response to chat panel.
	// Then it will keep listening on the stdout of the agent process, and render the message to chat panel once it receives a new message.
	handle(
		request: vscode.ChatRequest,
		context: vscode.ChatContext,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken
	): Promise<vscode.ChatResult> {
		return new Promise<vscode.ChatResult>((resolve, reject) => {
			this.logService.debug(`WorkspaceAgent received user prompt: ${request.prompt}`);
			const child: cp.ChildProcessWithoutNullStreams = cp.spawn('/opt/sandboxd/sbin/wsenv', ['agent', 'run', '--stream-events=json', '--agent=workspace', `--session=${request.sessionId}`], {
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
					const event: LLMSession.Message = JSON.parse(line);
					this.handleEvent(event, stream);
				} catch (error) {
					this.logService.error(`Failed to decode agent's event: ${line}`);
					child.kill('SIGTERM');
					reject(error);
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
				resolve({});
				rl.close();
			});

			child.stdin.write(request.prompt);
			child.stdin.end();

		});
	}

	handleEvent(event: LLMSession.Message, responseStream: vscode.ChatResponseStream) {
		switch (event.role) {
			case LLMSession.Role.Assistant: {
				if (event.content) {
					responseStream.markdown(event.content.text || '');
				}
				if (event.tool_call) {
					const id = event.tool_call.id;
					responseStream.progress(event.tool_call.name, async (_progress) => {
						return new Promise<void>((resolve) => {
							this.toolCallings.set(id, () => {
								resolve();
							});
						});
					});
				}
				break;
			}
			case LLMSession.Role.Tool: {
				this.toolCallings.get(event.tool_call?.id || '')?.();
				break;
			}
			default: {
				this.logService.warn(`WorkspaceAgent received message with unsupported role: ${event.role}`);
				break;
			}
		}
	}
}
