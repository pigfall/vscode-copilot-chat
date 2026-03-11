import * as cp from 'child_process';
import * as vscode from 'vscode';
import { IExtensionContribution } from '../../common/contributions';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ILogService } from '../../../platform/log/common/logService';
import * as readline from 'readline';
import { LLMSession } from '../common/llmSession';

// Register the WorkspaceAgent as a chat participant in VS Code.
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
			const child: cp.ChildProcessWithoutNullStreams = cp.spawn('/opt/sandboxd/sbin/wsenv', ['agent', 'run', '--resume-if-exist', '--stream-events=json', `--session-dir=/var/log/sandbox/.wsenv/llm-sessions/vscode-copilot`, `--session=${request.sessionId}`, `--with-sandbox-tools`], {
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
					this.logService.debug(`received agent's output: ${line}`);
					const event: LLMSession.Message = JSON.parse(line);
					this.handleEvent(event, stream);
				} catch (error) {
					this.logService.error(`handle agent's event error: ${error}, ${line}`);
					child.kill('SIGTERM');
					reject(error);
				}
			});

			// Read the stderr of the agent, and log it.
			child.stderr.setEncoding('utf8');
			child.stderr.on('data', (data) => {
				this.logService.error(`agent's stderr: ${data}`);
			});

			const cancellationHandler = token.onCancellationRequested(() => {
				this.logService.debug(`Chat request cancelled, killing the agent process.`);
				child.kill('SIGTERM');
			});

			child.on('error', (error) => {
				this.logService.error(`agent error: ${error.message}`);
				cancellationHandler.dispose();
				reject(error);
			});

			child.on('close', (code) => {
				cancellationHandler.dispose();
				rl.close();
				this.logService.debug(`agent process exited with code: ${code}`);
				if (code !== 0) {
					reject(new Error(`agent process exited with code: ${code}`));
					return;
				}
				resolve({});
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
					// The agent process is handling the tool call request.
					// We add a ui element to show the tool is invoking.
					const id = event.tool_call.id;
					responseStream.progress(event.tool_call.name, async (_progress) => {
						return new Promise<void>((resolve) => {
							// Save the promise's resolve to the map.
							// Resolve it when we receive the event of tool call result.
							// After the promise is resolved, the chat pannel will show the tool call is finished.
							this.toolCallings.set(id, () => {
								resolve();
							});
						});
					});
				}
				break;
			}
			case LLMSession.Role.Tool: {
				// Mark the tool call finished.
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
