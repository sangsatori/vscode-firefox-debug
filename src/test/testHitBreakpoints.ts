import { DebugProtocol } from 'vscode-debugprotocol';
import { DebugClient } from 'vscode-debugadapter-testsupport';
import * as path from 'path';
import * as util from './util';
import * as assert from 'assert';

describe('Firefox debug adapter', function() {

	let dc: DebugClient;
	const TESTDATA_PATH = path.join(__dirname, '../../testdata');

	beforeEach(async function() {
		dc = await util.initDebugClient(TESTDATA_PATH, true);
	});

	afterEach(async function() {
		await dc.stop();
	});

	it('should hit a breakpoint', async function() {

		let sourcePath = path.join(TESTDATA_PATH, 'web/main.js');
		await util.setBreakpoints(dc, sourcePath, [ 3 ]);

		util.evaluateCloaked(dc, 'noop()');

		let stoppedEvent = await util.receiveStoppedEvent(dc);
		assert.equal(stoppedEvent.body.allThreadsStopped, false);
		assert.equal(stoppedEvent.body.reason, 'breakpoint');
	});

	it('should hit a breakpoint in an evaluateRequest', async function() {

		let sourcePath = path.join(TESTDATA_PATH, 'web/main.js');
		await util.setBreakpoints(dc, sourcePath, [ 3 ]);

		util.evaluate(dc, 'noop()');

		let stoppedEvent = await util.receiveStoppedEvent(dc);
		assert.equal(stoppedEvent.body.allThreadsStopped, false);
		assert.equal(stoppedEvent.body.reason, 'breakpoint');
	});

	it('should hit an uncaught exception breakpoint', async function() {

		await dc.setExceptionBreakpointsRequest({filters: [ 'uncaught' ]});

		util.evaluateCloaked(dc, 'throwException()');

		let stoppedEvent = await util.receiveStoppedEvent(dc);
		assert.equal(stoppedEvent.body.allThreadsStopped, false);
		assert.equal(stoppedEvent.body.reason, 'exception');
	});

	it('should not hit an uncaught exception breakpoint triggered by a debugger eval', async function() {

		await dc.setExceptionBreakpointsRequest({filters: [ 'uncaught' ]});
		
		util.evaluate(dc, 'throwException()');

		await util.assertPromiseTimeout(util.receiveStoppedEvent(dc), 1000);
	});

	it('should not hit an uncaught exception breakpoint when those are disabled', async function() {

		await dc.setExceptionBreakpointsRequest({filters: []});

		util.evaluateCloaked(dc, 'throwException()');

		await util.assertPromiseTimeout(util.receiveStoppedEvent(dc), 1000);
	});

	it('should hit a caught exception breakpoint', async function() {

		await dc.setExceptionBreakpointsRequest({filters: [ 'all' ]});

		util.evaluateCloaked(dc, 'throwAndCatchException()');

		let stoppedEvent = await util.receiveStoppedEvent(dc);
		assert.equal(stoppedEvent.body.allThreadsStopped, false);
		assert.equal(stoppedEvent.body.reason, 'exception');
	});

	it('should not hit a caught exception breakpoint triggered by a debugger eval', async function() {

		await dc.setExceptionBreakpointsRequest({filters: [ 'all' ]});
		
		util.evaluate(dc, 'throwAndCatchException()');

		await util.assertPromiseTimeout(util.receiveStoppedEvent(dc), 1000);
	});

	it('should not hit a caught exception breakpoint when those are disabled', async function() {

		await dc.setExceptionBreakpointsRequest({filters: [ 'uncaught' ]});

		util.evaluateCloaked(dc, 'throwAndCatchException()');

		await util.assertPromiseTimeout(util.receiveStoppedEvent(dc), 1000);
	});

	it('should break on a debugger statement', async function() {

		let stoppedEvent = await util.runCommandAndReceiveStoppedEvent(dc, 
			() => util.evaluate(dc, 'loadScript("debuggerStatement.js")'));

		assert.equal(stoppedEvent.body.allThreadsStopped, false);
		assert.equal(stoppedEvent.body.reason, 'debuggerStatement');

		await dc.continueRequest({ threadId: stoppedEvent.body.threadId });

		stoppedEvent = await util.runCommandAndReceiveStoppedEvent(dc, 
			() => util.evaluate(dc, 'debuggerStatement()'));

		assert.equal(stoppedEvent.body.allThreadsStopped, false);
		assert.equal(stoppedEvent.body.reason, 'debuggerStatement');
	});

	it('should not hit a breakpoint after it has been removed', async function() {

		let sourcePath = path.join(TESTDATA_PATH, 'web/main.js');
		await util.setBreakpoints(dc, sourcePath, [ 8, 10 ]);

		util.evaluateCloaked(dc, 'vars()');

		let stoppedEvent = await util.receiveStoppedEvent(dc);
		let threadId = stoppedEvent.body.threadId!;
		let stackTrace = await dc.stackTraceRequest({ threadId });

		assert.equal(stackTrace.body.stackFrames[0].line, 8);

		await util.setBreakpoints(dc, sourcePath, [ 12 ]);
		await util.runCommandAndReceiveStoppedEvent(dc, () => dc.continueRequest({ threadId }));
		stackTrace = await dc.stackTraceRequest({ threadId });

		assert.equal(stackTrace.body.stackFrames[0].line, 12);

	});

	it('should skip a breakpoint until its hit count is reached', async function() {

		let sourcePath = path.join(TESTDATA_PATH, 'web/main.js');
		await util.setBreakpoints(dc, sourcePath, [ { line: 24, hitCondition: '4' } ]);

		let stoppedEvent = await util.runCommandAndReceiveStoppedEvent(dc, 
			() => util.evaluate(dc, 'factorial(5)')
		);

		let threadId = stoppedEvent.body.threadId!;
		let stackTrace = await dc.stackTraceRequest({ threadId });
		let scopes = await dc.scopesRequest({ frameId: stackTrace.body.stackFrames[0].id });

		let variablesResponse = await dc.variablesRequest({ variablesReference: scopes.body.scopes[0].variablesReference });
		let variables = variablesResponse.body.variables;
		assert.equal(util.findVariable(variables, 'n').value, '2');
	});

	it('should show the output from logpoints', async function() {

		let sourcePath = path.join(TESTDATA_PATH, 'web/main.js');
		await util.setBreakpoints(dc, sourcePath, [ { line: 24, logMessage: 'factorial({n})' } ]);

		const outputEvents: DebugProtocol.OutputEvent[] = [];
		util.evaluate(dc, 'factorial(3)');
		for (let i = 0; i < 3; i++) {
			outputEvents.push(<DebugProtocol.OutputEvent> await dc.waitForEvent('output'));
		}

		assert.equal(outputEvents[0].body.output.trimRight(), 'factorial(3)');
		assert.equal(outputEvents[1].body.output.trimRight(), 'factorial(2)');
		assert.equal(outputEvents[2].body.output.trimRight(), 'factorial(1)');
	});
});
