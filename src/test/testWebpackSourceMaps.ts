import * as os from 'os';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as uuid from 'uuid';
import * as util from './util';
import * as sourceMapUtil from './sourceMapUtil';
import * as webpack from 'webpack';
import { DebugClient } from "vscode-debugadapter-testsupport";

const TESTDATA_PATH = path.join(__dirname, '../../testdata/web/sourceMaps/modules');

describe('Webpack sourcemaps: The debugger', function() {

	let dc: DebugClient | undefined;

	afterEach(async function() {
		if (dc) {
			await dc.stop();
			dc = undefined;
		}
	});

	for (let sourceMaps of [ 'server', 'client' ]) {
	for (let devtool of [
		'cheap-eval-source-map', 'cheap-source-map', 'cheap-module-eval-source-map', 'inline-source-map',
		'cheap-module-source-map' , 'eval-source-map' , 'source-map' , 'nosources-source-map'
	]) {

		const description = `should map webpack-bundled modules with devtool "${devtool}" to their original sources with source-maps handled by the ${sourceMaps}`;

		// disable tests with webpack devtools that are known to be broken (webpack bug #5491)
		if (devtool.indexOf('eval') < 0) {
			it.skip(description);
			continue;
		}

		// server-side source-maps are not supported with Firefox >= 66.0
		if ((process.env['NEW_STEP_OUT_BEHAVIOR'] === 'true') && (sourceMaps === 'server')) {
			it.skip(description);
			continue;
		}

		it(description, async function() {

			let targetDir = await prepareTargetDir();

			await build(targetDir, <Devtool>devtool);

			dc = await util.initDebugClient('', true, {
				file: path.join(targetDir, 'index.html'),
				pathMappings: [{ url: 'webpack:///', path: targetDir + '/' }],
				sourceMaps
			});

			await sourceMapUtil.testSourcemaps(dc, targetDir, 1);

			await fs.remove(targetDir);
		});
	}}
});

async function prepareTargetDir(): Promise<string> {

	let targetDir = path.join(os.tmpdir(), `vscode-firefox-debug-test-${uuid.v4()}`);
	await fs.mkdir(targetDir);
	await sourceMapUtil.copyFiles(TESTDATA_PATH, targetDir, ['index.html', 'f.js', 'g.js']);

	return targetDir;
}

type Devtool = 
	'cheap-eval-source-map' | 'cheap-source-map' | 'cheap-module-eval-source-map' | 'inline-source-map' |
	'cheap-module-source-map' | 'eval-source-map' | 'source-map' | 'nosources-source-map';

function build(targetDir: string, devtool: Devtool): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		webpack({
			context: targetDir,
			entry: './f.js',
			output: {
				path: targetDir,
				filename: 'bundle.js'
			},
			devtool: devtool
		}, (err, stats) => {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	})
}