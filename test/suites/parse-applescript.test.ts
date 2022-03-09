import { expect, test } from 'vitest';
import { parseAppleScript } from '~/parse-applescript.js';

test('correctly parses applescript', () => {
	// TODO: get a json serializer in AppleScript and generate random JSON values
});

test('correctly throws on invalid applescript', () => {
	expect(() => parseAppleScript(`{1, 2, 3`)).toThrow();
});
