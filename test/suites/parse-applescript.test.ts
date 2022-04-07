import * as fs from 'node:fs';
import deepEqual from 'deep-equal';
import { expect, test } from 'vitest';
import { join } from 'desm';
import { outdent } from 'outdent';
import fc from 'fast-check';
import traverse from 'traverse';
import { runAppleScriptSync } from '~test/utils/applescript.js';
import { parseAppleScript } from '~/parse-applescript.js';

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

				const appleScriptValue = runAppleScriptSync(outdent`
					${jsonAppleScript}

					return decode(${
						typeof json === 'string'
							? JSON.stringify(json)
							: `"${JSON.stringify(json)}"`
					})
				`);

				expect(jsonValue).toEqual(parseAppleScript(appleScriptValue));
			}
		)
	);
});

test('correctly throws on invalid applescript', () => {
	expect(() => parseAppleScript(`{1, 2, 3`)).toThrow();
	expect(() => parseAppleScript(`{1, "hello, 3`)).toThrow();
});
