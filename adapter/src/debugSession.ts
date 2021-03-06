/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {DebugProtocol} from 'vscode-debugprotocol';
import {ProtocolServer} from './protocol';
import {Response, Event} from './messages';
import * as Net from 'net';
import * as Path from 'path';
import * as Url from 'url';


export class Source implements DebugProtocol.Source {
	name: string;
	path: string;
	sourceReference: number;

	public constructor(name: string, path: string, id: number = 0, origin?: string, data?: any) {
		this.name = name;
		this.path = path;
		this.sourceReference = id;
		if (origin) {
			(<any>this).origin = origin;
		}
		if (data) {
			(<any>this).adapterData = data;
		}
	}
}

export class Scope implements DebugProtocol.Scope {
	name: string;
	variablesReference: number;
	expensive: boolean;

	public constructor(name: string, reference: number, expensive: boolean = false) {
		this.name = name;
		this.variablesReference = reference;
		this.expensive = expensive;
	}
}

export class StackFrame implements DebugProtocol.StackFrame {
	id: number;
	source: Source;
	line: number;
	column: number;
	name: string;

	public constructor(i: number, nm: string, src: Source, ln: number, col: number) {
		this.id = i;
		this.source = src;
		this.line = ln;
		this.column = col;
		this.name = nm;
	}
}

export class Thread implements DebugProtocol.Thread {
	id: number;
	name: string;

	public constructor(id: number, name: string) {
		this.id = id;
		if (name) {
			this.name = name;
		} else {
			this.name = 'Thread #' + id;
		}
	}
}

export class Variable implements DebugProtocol.Variable {
	name: string;
	value: string;
	variablesReference: number;

	public constructor(name: string, value: string, ref: number = 0) {
		this.name = name;
		this.value = value;
		this.variablesReference = ref;
	}
}

export class Breakpoint implements DebugProtocol.Breakpoint {
	verified: boolean;

	public constructor(verified: boolean, line?: number, column?: number, source?: Source) {
		this.verified = verified;
		const e: DebugProtocol.Breakpoint = this;
		if (typeof line === 'number') {
			e.line = line;
		}
		if (typeof column === 'number') {
			e.column = column;
		}
		if (source) {
			e.source = source;
		}
	}
}

export class Module implements DebugProtocol.Module {
	id: number | string;
	name: string;

	public constructor(id: number | string, name: string) {
		this.id = id;
		this.name = name;
	}
}

export class StoppedEvent extends Event implements DebugProtocol.StoppedEvent {
	body: {
		reason: string;
		threadId: number;
	};

	public constructor(reason: string, threadId: number, exception_text: string = null) {
		super('stopped');
		this.body = {
			reason: reason,
			threadId: threadId
		};

		if (exception_text) {
			const e: DebugProtocol.StoppedEvent = this;
			e.body.text = exception_text;
		}
	}
}

export class InitializedEvent extends Event implements DebugProtocol.InitializedEvent {
	public constructor() {
		super('initialized');
	}
}

export class TerminatedEvent extends Event implements DebugProtocol.TerminatedEvent {
	public constructor(restart?: boolean) {
		super('terminated');
		if (typeof restart === 'boolean') {
			const e: DebugProtocol.TerminatedEvent = this;
			e.body = {
				restart: restart
			};
		}
	}
}

export class OutputEvent extends Event implements DebugProtocol.OutputEvent {
	body: {
		category: string,
		output: string
	};

	public constructor(output: string, category: string = 'console') {
		super('output');
		this.body = {
			category: category,
			output: output
		};
	}
}

export class ThreadEvent extends Event implements DebugProtocol.ThreadEvent {
	body: {
		reason: string,
		threadId: number
	};

	public constructor(reason: string, threadId: number) {
		super('thread');
		this.body = {
			reason: reason,
			threadId: threadId
		};
	}
}

export class BreakpointEvent extends Event implements DebugProtocol.BreakpointEvent {
	body: {
		reason: string,
		breakpoint: Breakpoint
	};

	public constructor(reason: string, breakpoint: Breakpoint) {
		super('breakpoint');
		this.body = {
			reason: reason,
			breakpoint: breakpoint
		};
	}
}

export class ModuleEvent extends Event implements DebugProtocol.ModuleEvent {
	body: {
		reason: 'new' | 'changed' | 'removed',
		module: Module
	};

	public constructor(reason: 'new' | 'changed' | 'removed', module: Module) {
		super('module');
		this.body = {
			reason: reason,
			module: module
		};
	}
}

export enum ErrorDestination {
	User = 1,
	Telemetry = 2
};

export class DebugSession extends ProtocolServer {

	private _debuggerLinesStartAt1: boolean;
	private _debuggerColumnsStartAt1: boolean;
	private _debuggerPathsAreURIs: boolean;

	private _clientLinesStartAt1: boolean;
	private _clientColumnsStartAt1: boolean;
	private _clientPathsAreURIs: boolean;

	private _isServer: boolean;

	public constructor(obsolete_debuggerLinesAndColumnsStartAt1?: boolean, obsolete_isServer?: boolean) {
		super();

		const linesAndColumnsStartAt1 = typeof obsolete_debuggerLinesAndColumnsStartAt1 === 'boolean' ? obsolete_debuggerLinesAndColumnsStartAt1 : false;
		this._debuggerLinesStartAt1 = linesAndColumnsStartAt1;
		this._debuggerColumnsStartAt1 = linesAndColumnsStartAt1;
		this._debuggerPathsAreURIs = false;

		this._clientLinesStartAt1 = true;
		this._clientColumnsStartAt1 = true;
		this._clientPathsAreURIs = false;

		this._isServer = typeof obsolete_isServer === 'boolean' ? obsolete_isServer : false;

		this.on('close', () => {
			this.shutdown();
		});
		this.on('error', (error) => {
			this.shutdown();
		});
	}

	public setDebuggerPathFormat(format: string) {
		this._debuggerPathsAreURIs = format !== 'path';
	}

	public setDebuggerLinesStartAt1(enable: boolean) {
		this._debuggerLinesStartAt1 = enable;
	}

	public setDebuggerColumnsStartAt1(enable: boolean) {
		this._debuggerColumnsStartAt1 = enable;
	}

	public setRunAsServer(enable: boolean) {
		this._isServer = enable;
	}

	/**
	 * A virtual constructor...
	 */
	public static run(debugSession: typeof DebugSession) {

		// parse arguments
		let port = 0;
		const args = process.argv.slice(2);
		args.forEach(function (val, index, array) {
			const portMatch = /^--server=(\d{4,5})$/.exec(val);
			if (portMatch) {
				port = parseInt(portMatch[1], 10);
			}
		});

		if (port > 0) {
			// start as a server
			console.error(`waiting for debug protocol on port ${port}`);
			Net.createServer((socket) => {
				console.error('>> accepted connection from client');
				socket.on('end', () => {
					console.error('>> client connection closed\n');
				});
				const session = new debugSession(false, true);
				session.setRunAsServer(true);
				session.start(socket, socket);
			}).listen(port);
		} else {

			// start a session
			//console.error('waiting for debug protocol on stdin/stdout');
			const session = new debugSession(false);
			process.on('SIGTERM', () => {
				session.shutdown();
			});
			session.start(process.stdin, process.stdout);
		}
	}

	public shutdown(): void {
		if (this._isServer) {
			console.error('process.exit ignored in server mode');
		} else {
			// wait a bit before shutting down
			setTimeout(() => {
				process.exit(0);
			}, 100);
		}
	}

	protected sendErrorResponse(response: DebugProtocol.Response, codeOrMessage: number | DebugProtocol.Message, format?: string, variables?: any, dest: ErrorDestination = ErrorDestination.User): void {

		let msg : DebugProtocol.Message;
		if (typeof codeOrMessage === 'number') {
			msg = <DebugProtocol.Message> {
				id: <number> codeOrMessage,
				format: format
			};
			if (variables) {
				msg.variables = variables;
			}
			if (dest & ErrorDestination.User) {
				msg.showUser = true;
			}
			if (dest & ErrorDestination.Telemetry) {
				msg.sendTelemetry = true;
			}
		} else {
			msg = codeOrMessage;
		}

		response.success = false;
		response.message = DebugSession.formatPII(msg.format, true, msg.variables);
		if (!response.body) {
			response.body = { };
		}
		response.body.error = msg;

		this.sendResponse(response);
	}

	protected dispatchRequest(request: DebugProtocol.Request): void {

		const response = new Response(request);

		try {
			if (request.command === 'initialize') {
				var args = <DebugProtocol.InitializeRequestArguments> request.arguments;

				if (typeof args.linesStartAt1 === 'boolean') {
					this._clientLinesStartAt1 = args.linesStartAt1;
				}
				if (typeof args.columnsStartAt1 === 'boolean') {
					this._clientColumnsStartAt1 = args.columnsStartAt1;
				}

				if (args.pathFormat !== 'path') {
					this.sendErrorResponse(response, 2018, 'debug adapter only supports native paths', null, ErrorDestination.Telemetry);
				} else {
					const initializeResponse = <DebugProtocol.InitializeResponse> response;
					initializeResponse.body = {};
					this.initializeRequest(initializeResponse, args);
				}

			} else if (request.command === 'launch') {
				this.launchRequest(<DebugProtocol.LaunchResponse> response, request.arguments);

			} else if (request.command === 'attach') {
				this.attachRequest(<DebugProtocol.AttachResponse> response, request.arguments);

			} else if (request.command === 'disconnect') {
				this.disconnectRequest(<DebugProtocol.DisconnectResponse> response, request.arguments);

			} else if (request.command === 'setBreakpoints') {
				this.setBreakPointsRequest(<DebugProtocol.SetBreakpointsResponse> response, request.arguments);

			} else if (request.command === 'setFunctionBreakpoints') {
				this.setFunctionBreakPointsRequest(<DebugProtocol.SetFunctionBreakpointsResponse> response, request.arguments);

			} else if (request.command === 'setExceptionBreakpoints') {
				this.setExceptionBreakPointsRequest(<DebugProtocol.SetExceptionBreakpointsResponse> response, request.arguments);

			} else if (request.command === 'configurationDone') {
				this.configurationDoneRequest(<DebugProtocol.ConfigurationDoneResponse> response, request.arguments);

			} else if (request.command === 'continue') {
				this.continueRequest(<DebugProtocol.ContinueResponse> response, request.arguments);

			} else if (request.command === 'next') {
				this.nextRequest(<DebugProtocol.NextResponse> response, request.arguments);

			} else if (request.command === 'stepIn') {
				this.stepInRequest(<DebugProtocol.StepInResponse> response, request.arguments);

			} else if (request.command === 'stepOut') {
				this.stepOutRequest(<DebugProtocol.StepOutResponse> response, request.arguments);

			} else if (request.command === 'stepBack') {
				this.stepBackRequest(<DebugProtocol.StepBackResponse> response, request.arguments);

			} else if (request.command === 'pause') {
				this.pauseRequest(<DebugProtocol.PauseResponse> response, request.arguments);

			} else if (request.command === 'stackTrace') {
				this.stackTraceRequest(<DebugProtocol.StackTraceResponse> response, request.arguments);

			} else if (request.command === 'scopes') {
				this.scopesRequest(<DebugProtocol.ScopesResponse> response, request.arguments);

			} else if (request.command === 'variables') {
				this.variablesRequest(<DebugProtocol.VariablesResponse> response, request.arguments);

			} else if (request.command === 'setVariable') {
				this.setVariableRequest(<DebugProtocol.SetVariableResponse> response, request.arguments);

			} else if (request.command === 'source') {
				this.sourceRequest(<DebugProtocol.SourceResponse> response, request.arguments);

			} else if (request.command === 'threads') {
				this.threadsRequest(<DebugProtocol.ThreadsResponse> response);

			} else if (request.command === 'evaluate') {
				this.evaluateRequest(<DebugProtocol.EvaluateResponse> response, request.arguments);

			} else {
				this.customRequest(request.command, <DebugProtocol.Response> response, request.arguments);
			}
		} catch (e) {
			this.sendErrorResponse(response, 1104, '{_stack}', { _exception: e.message, _stack: e.stack }, ErrorDestination.Telemetry);
		}
	}

	protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {

		// This default debug adapter does not support conditional breakpoints.
		response.body.supportsConditionalBreakpoints = false;

		// This default debug adapter does not support function breakpoints.
		response.body.supportsFunctionBreakpoints = false;

		// This default debug adapter implements the 'configurationDone' request.
		response.body.supportsConfigurationDoneRequest = true;

		// This default debug adapter does not support hovers based on the 'evaluate' request.
		response.body.supportsEvaluateForHovers = false;

		// This default debug adapter does not support the 'stepBack' request.
		response.body.supportsStepBack = false;

		// This default debug adapter does not support the 'setVariable' request.
		response.body.supportsSetVariable = false;

		this.sendResponse(response);
	}

	protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments): void {
		this.sendResponse(response);
		this.shutdown();
	}

	protected launchRequest(response: DebugProtocol.LaunchResponse, args: DebugProtocol.LaunchRequestArguments): void {
		this.sendResponse(response);
	}

	protected attachRequest(response: DebugProtocol.AttachResponse, args: DebugProtocol.AttachRequestArguments): void {
		this.sendResponse(response);
	}

	protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {
		this.sendResponse(response);
	}

	protected setFunctionBreakPointsRequest(response: DebugProtocol.SetFunctionBreakpointsResponse, args: DebugProtocol.SetFunctionBreakpointsArguments): void {
		this.sendResponse(response);
	}

	protected setExceptionBreakPointsRequest(response: DebugProtocol.SetExceptionBreakpointsResponse, args: DebugProtocol.SetExceptionBreakpointsArguments): void {
		this.sendResponse(response);
	}

	protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments): void {
		this.sendResponse(response);
	}

	protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments) : void {
		this.sendResponse(response);
	}

	protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments) : void {
		this.sendResponse(response);
	}

	protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments) : void {
		this.sendResponse(response);
	}

	protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments) : void {
		this.sendResponse(response);
	}

	protected stepBackRequest(response: DebugProtocol.StepBackResponse, args: DebugProtocol.StepBackArguments) : void {
		this.sendResponse(response);
	}

	protected pauseRequest(response: DebugProtocol.PauseResponse, args: DebugProtocol.PauseArguments) : void {
		this.sendResponse(response);
	}

	protected sourceRequest(response: DebugProtocol.SourceResponse, args: DebugProtocol.SourceArguments) : void {
		this.sendResponse(response);
	}

	protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
		this.sendResponse(response);
	}

	protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {
		this.sendResponse(response);
	}

	protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
		this.sendResponse(response);
	}

	protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {
		this.sendResponse(response);
	}

	protected setVariableRequest(response: DebugProtocol.SetVariableResponse, args: DebugProtocol.SetVariableArguments): void {
		this.sendResponse(response);
	}

	protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {
		this.sendResponse(response);
	}

	/**
	 * Override this hook to implement custom requests.
	 */
	protected customRequest(command: string, response: DebugProtocol.Response, args: any): void {
		this.sendErrorResponse(response, 1014, 'unrecognized request', null, ErrorDestination.Telemetry);
	}

	//---- protected -------------------------------------------------------------------------------------------------

	protected convertClientLineToDebugger(line: number): number {
		if (this._debuggerLinesStartAt1) {
			return this._clientLinesStartAt1 ? line : line + 1;
		}
		return this._clientLinesStartAt1 ? line - 1 : line;
	}

	protected convertDebuggerLineToClient(line: number): number {
		if (this._debuggerLinesStartAt1) {
			return this._clientLinesStartAt1 ? line : line - 1;
		}
		return this._clientLinesStartAt1 ? line + 1 : line;
	}

	protected convertClientColumnToDebugger(column: number): number {
		if (this._debuggerColumnsStartAt1) {
			return this._clientColumnsStartAt1 ? column : column + 1;
		}
		return this._clientColumnsStartAt1 ? column - 1 : column;
	}

	protected convertDebuggerColumnToClient(column: number): number {
		if (this._debuggerColumnsStartAt1) {
			return this._clientColumnsStartAt1 ? column : column - 1;
		}
		return this._clientColumnsStartAt1 ? column + 1 : column;
	}

	protected convertClientPathToDebugger(clientPath: string): string {
		if (this._clientPathsAreURIs != this._debuggerPathsAreURIs) {
			if (this._clientPathsAreURIs) {
				return DebugSession.uri2path(clientPath);
			} else {
				return DebugSession.path2uri(clientPath);
			}
		}
		return clientPath;
	}

	protected convertDebuggerPathToClient(debuggerPath: string): string {
		if (this._debuggerPathsAreURIs != this._clientPathsAreURIs) {
			if (this._debuggerPathsAreURIs) {
				return DebugSession.uri2path(debuggerPath);
			} else {
				return DebugSession.path2uri(debuggerPath);
			}
		}
		return debuggerPath;
	}

	//---- private -------------------------------------------------------------------------------

	private static path2uri(str: string): string {
		var pathName = str.replace(/\\/g, '/');
		if (pathName[0] !== '/') {
			pathName = '/' + pathName;
		}
		return encodeURI('file://' + pathName);
	}

	private static uri2path(url: string): string {
		return Url.parse(url).pathname;
	}

	private static _formatPIIRegexp = /{([^}]+)}/g;

	/*
	* If argument starts with '_' it is OK to send its value to telemetry.
	*/
	private static formatPII(format:string, excludePII: boolean, args: {[key: string]: string}): string {
		return format.replace(DebugSession._formatPIIRegexp, function(match, paramName) {
			if (excludePII && paramName.length > 0 && paramName[0] !== '_') {
				return match;
			}
			return args[paramName] && args.hasOwnProperty(paramName) ?
				args[paramName] :
				match;
		})
	}
}
