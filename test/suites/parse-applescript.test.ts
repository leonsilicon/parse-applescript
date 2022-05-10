import deepEqual from 'deep-equal';
import { join } from 'desm';
import fc from 'fast-check';
import * as fs from 'node:fs';
import { outdent } from 'outdent';
import traverse from 'traverse';
import { expect, test } from 'vitest';

import { parseAppleScript } from '~/parse-applescript.js';
import { runAppleScriptSync } from '~test/utils/applescript.js';

const jsonAppleScript = fs.readFileSync(
	join(import.meta.url, '../json.applescript')
);
test('correctly parses applescript', async () => {
	// Some nasty previous failing cases
	expect(parseAppleScript('{A:"!"}')).toEqual({ A: '!' });
	expect(parseAppleScript('{A:"\\\\"}')).toEqual({ A: '\\' });
	expect(parseAppleScript('"\\""')).toEqual('"');
	expect(parseAppleScript('"\\\\"')).toEqual('\\');
	expect(parseAppleScript('{S:""}')).toEqual({ S: '' });
	expect(parseAppleScript('\\\\')).toEqual('\\\\');
	expect(parseAppleScript('\\')).toEqual('\\');

	expect(
		parseAppleScript(outdent`
			{menu item "System Preferences…" of menu "Apple" of menu bar item "Apple" of menu bar 1 of application process "System Preferences" of application "System Events", menu item "App Store…, 1 update" of menu "Apple" of menu bar item "Apple" of menu bar 1 of application process "System Preferences" of application "System Events", menu item 6 of menu "Apple" of menu bar item "Apple" of menu bar 1 of application process "System Preferences" of application "System Events"}
		`)
	).toEqual([
		'menu item "System Preferences…" of menu "Apple" of menu bar item "Apple" of menu bar 1 of application process "System Preferences" of application "System Events"',
		'menu item "App Store…, 1 update" of menu "Apple" of menu bar item "Apple" of menu bar 1 of application process "System Preferences" of application "System Events"',
		'menu item 6 of menu "Apple" of menu bar item "Apple" of menu bar 1 of application process "System Preferences" of application "System Events"',
	]);

	expect(
		parseAppleScript(outdent`
			{minimum value:missing value, orientation:missing value, position:{454, 1174}, class:pop up button, accessibility description:"PDE", role description:"pop up button", focused:false, title:missing value, size:{182, 25}, help:missing value, entire contents:{}, enabled:true, maximum value:missing value, role:"AXPopUpButton", value:"Preview", subrole:missing value, selected:missing value, name:missing value, description:"PDE"}
		`)
	).toEqual({
		'minimum value': null,
		orientation: null,
		position: [454, 1174],
		class: 'pop up button',
		'accessibility description': 'PDE',
		'role description': 'pop up button',
		focused: false,
		title: null,
		size: [182, 25],
		help: null,
		'entire contents': {},
		enabled: true,
		'maximum value': null,
		role: 'AXPopUpButton',
		value: 'Preview',
		subrole: null,
		selected: null,
		name: null,
		description: 'PDE',
	});

	fc.assert(
		fc.property(
			fc.jsonValue().filter((jsonValue) => {
				for (const node of traverse(jsonValue).nodes()) {
					// AppleScript can't distinguish between empty hashmap and empty array
					if (deepEqual(node, []) || deepEqual(node, {})) return false;

					// AppleScript doesn't support null
					if (node === null) return false;

					// AppleScript has around 14 digit max precision https://macscripter.net/viewtopic.php?id=44168
					// AppleScript doesn't distinguish between +0 and -0
					if (
						(typeof node === 'number' && String(node).length > 14) ||
						Object.is(node, -0)
					) {
						return false;
					}
				}

				for (const jsonPath of traverse(jsonValue).paths()) {
					// AppleScript only supports keys with letters
					if (jsonPath.some((pathPart) => !/^[A-Za-z]+$/.test(pathPart))) {
						return false;
					}
				}

				return true;
			}),
			(jsonValue) => {
				const json = JSON.stringify(jsonValue);

				let appleScriptValue: string;
				try {
					appleScriptValue = runAppleScriptSync(outdent`
						${jsonAppleScript}

						return decode(${
							typeof json === 'string'
								? JSON.stringify(json)
								: `"${JSON.stringify(json)}"`
						})
					`);
				} catch {
					// If the script failed to parse, that's not because of our program
					return;
				}

				expect(jsonValue).toEqual(parseAppleScript(appleScriptValue));
			}
		)
	);
});

test('correctly throws on invalid applescript', () => {
	expect(() => parseAppleScript(`{1, 2, 3`)).toThrow();
	expect(() => parseAppleScript(`{1, "hello, 3`)).toThrow();
});
