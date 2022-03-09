import { Buffer } from 'node:buffer';

export class AppleScriptParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AppleScriptParseError';
	}
}

/**
 * Ported over from https://github.com/TooTallNate/node-applescript/blob/master/lib/applescript.js
 */
class AppleScriptParser {
	value: string;
	index: number;

	constructor(appleScriptString: string) {
		this.value = appleScriptString;
		this.index = 0;
	}

	parse() {
		return this.parseFromFirstRemaining();
	}

	/**
	Attempts to determine the data type of the next part of the String to
	parse. The 'this' value has a Object with 'value' as the AppleScript
	string to parse, and 'index' as the pointer to the current position
	of parsing in the String. This Function does not need to be exported???
	*/
	parseFromFirstRemaining() {
		const cur = this.value[this.index]!;

		switch (cur) {
			case '{':
				return this.parseArray();
			case '"':
				return this.parseString();
			case 'a':
				if (this.value.slice(this.index, this.index + 5) === 'alias') {
					return this.parseAlias();
				}

				break;
			case 'd':
				if (this.value.slice(this.index, this.index + 4) === 'date') {
					return this.parseDate();
				}

				break;
			case '«':
				if (this.value.slice(this.index, this.index + 5) === '«data') {
					return this.parseData();
				}

				break;

			// No default
		}

		// eslint-disable-next-line unicorn/prefer-number-properties
		if (!isNaN(cur as unknown as number)) {
			return this.parseNumber();
		}

		return this.parseUnknown();
	}

	/**
	Parses an AppleScript "alias", which is really just a reference to a
	location on the filesystem, but formatted kinda weirdly.
	*/
	parseAlias() {
		// Skips the "alias " string
		this.index += 6;

		return '/Volumes/' + this.parseString().replace(/:/g, '/');
	}

	/**
	Parses an AppleScript date into a native JavaScript Date instance.
	*/
	parseDate() {
		// Skips the "date " string
		this.index += 5;

		return new Date(this.parseString().replace(' at', ','));
	}

	/**
	Parses an AppleScript Array. Which looks like {}, instead of JavaScript's [].
	*/
	parseArray(): unknown[] {
		const rtn = [];

		const startIndex = this.index;
		// Skips the `{` character
		this.index += 1;

		let cur = this.value[this.index];

		while (cur !== '}') {
			// The ending `}` character was never found
			if (cur === undefined) {
				throw new AppleScriptParseError(
					`Ending \`}\` character of array at position ${startIndex} was never found.`
				);
			}

			rtn.push(this.parseFromFirstRemaining());

			if (this.value[this.index] === ',') {
				// Skips the ", " characters
				this.index += 2;
			}

			cur = this.value[this.index];
		}

		this.index += 1;

		return rtn;
	}

	/**
	Parses an AppleScript Number into a native JavaScript Number instance.
	*/
	parseNumber() {
		return Number(this.parseUnknown());
	}

	/**
	Parses «data » results into native Buffer instances.
	*/
	parseData() {
		let body = this.parseUnknown();
		body = body.slice(6, -1);
		const type = body.slice(0, 4);
		body = body.slice(4, body.length);
		const buf = Buffer.alloc(body.length / 2);
		let count = 0;
		for (let i = 0, l = body.length; i < l; i += 2) {
			buf[count] = Number.parseInt(body[i]! + body[i + 1]!, 16);
			count += 1;
		}

		(buf as any).type = type;
		return buf;
	}

	/**
	Parses a standard AppleScript String. Which starts and ends with "" chars.
	The \ char is the escape character, so anything after that is a valid part
	of the resulting String.
	*/
	parseString() {
		let rtn = '';

		const startIndex = this.index;
		// Skips the `"` character
		this.index += 1;

		let end = this.index;
		let cur = this.value[end];
		end += 1;

		// While the ending `"` character hasn't been reached
		while (cur !== '"') {
			if (cur === undefined) {
				throw new AppleScriptParseError(
					`Ending character \`"\` of string at position ${startIndex} was never found.`
				);
			}

			if (cur === '\\') {
				rtn += this.value.slice(this.index, end - 1);
				this.index = end;
				end += 1;
			}

			cur = this.value[end];
			end += 1;
		}

		rtn += this.value.slice(this.index, end - 1);
		this.index = end;
		return rtn;
	}

	/**
	When the "parseFromFirstRemaining" function can't figure out the data type
	of "str", then `parseUnknown` is used. It crams everything it sees
	into a String, until it finds a ',' or a '}' or it reaches the end of data.
	*/
	parseUnknown() {
		const END_OF_TOKEN = /[,\n}]/;

		const startIndex = this.index;
		let end = this.index;
		let cur = this.value[end]!;
		end += 1;

		while (cur !== undefined && !END_OF_TOKEN.test(cur)) {
			cur = this.value[end]!;
			end += 1;
		}

		if (cur === undefined) {
			throw new AppleScriptParseError(
				`Expected more characters, but reached end of input when parsing the input starting from position ${startIndex}.`
			);
		}

		const rtn = this.value.slice(this.index, end - 1);
		this.index = end - 1;
		return rtn;
	}
}

export function parseAppleScript(appleScriptString: string) {
	appleScriptString = appleScriptString.replaceAll('\n', ' ').trim();
	if (appleScriptString.length === 0) {
		return;
	}

	const parsedString = new AppleScriptParser(appleScriptString).parse();
	return parsedString;
}
