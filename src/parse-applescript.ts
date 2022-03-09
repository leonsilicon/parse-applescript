import { Buffer } from 'node:buffer';

export class AppleScriptParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AppleScriptParseError';
	}
}

/**
 * Ported from https://github.com/TooTallNate/node-applescript/blob/master/lib/applescript.js
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
			case '{': {
				return this.parseArrayOrRecord();
			}

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
		if (cur === '-' || !isNaN(cur as unknown as number)) {
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
	Parses a literal term (i.e. only letters)
	*/
	parseLiteral() {
		const literalChars = [];

		do {
			if (this.value[this.index] === undefined) {
				return literalChars.join('');
			}

			literalChars.push(this.value[this.index]);
			this.index += 1;
		} while (/[a-zA-Z\d]/.test(this.value[this.index]!));

		return literalChars.join('');
	}

	parseRecord() {
		const record: Record<string, unknown> = {};

		const startIndex = this.index;

		// Skip the initial `{` character
		this.index += 1;

		let cur = this.value[this.index];

		// While the end of the Record hasn't been reached
		while (cur !== '}') {
			if (cur === undefined) {
				throw new AppleScriptParseError(
					`Ending \`}\` character of record at position ${startIndex} was never found.`
				);
			}

			const key = this.parseLiteral();

			// Skip the `:` symbol
			this.index += 1;

			const value = this.parseFromFirstRemaining();

			record[key] = value;

			if (this.value[this.index] === ',') {
				// Skips the ", " characters
				this.index += 2;
			}

			cur = this.value[this.index];
		}

		// Skip the ending `}` character
		this.index += 1;

		return record;
	}

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
					`Ending \`}\` character of array/record at position ${startIndex} was never found.`
				);
			}

			rtn.push(this.parseFromFirstRemaining());

			if (this.value[this.index] === ',') {
				// Skips the ", " characters
				this.index += 2;
			}

			cur = this.value[this.index];
		}

		// Skip the ending `}` character
		this.index += 1;

		return rtn;
	}

	/**
	Parses an AppleScript Array or an Record, both which use {}.
	*/
	parseArrayOrRecord() {
		// Check which comes first, a colon (indicating a Record) or a comma or closing brace (indicating an Array)

		const nextClosingBraceIndex = this.value.indexOf('}', this.index);

		if (nextClosingBraceIndex === undefined) {
			throw new AppleScriptParseError(
				`Ending \`}\` character of array at position ${this.index} was never found.`
			);
		}

		// If the next few lines is a literal ended by a colon, then it is a record
		let literalIndex = this.index + 1;
		let literalChar = this.value[literalIndex]!;
		let isRecord = true;
		while (literalChar !== ':' && literalChar !== undefined) {
			if (!/[a-zA-Z\d]/.test(literalChar)) {
				isRecord = false;
				break;
			}

			literalIndex += 1;
			literalChar = this.value[literalIndex]!;
		}

		if (isRecord) {
			// The string represents an AppleScript record
			return this.parseRecord();
		} else {
			return this.parseArray();
		}
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
		let body = this.parseUnknown({ boolean: false }) as string;
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

		// Skips the initial `"` character
		this.index += 1;

		let curIndex = this.index;
		let curCharacter = this.value[curIndex];

		// While the ending `"` character hasn't been reached
		while (curCharacter !== '"') {
			if (curCharacter === undefined) {
				throw new AppleScriptParseError(
					`Ending character \`"\` of string at position ${startIndex} was never found.`
				);
			}

			if (curCharacter === '\\') {
				// Include character after backslash
				rtn += this.value.slice(this.index, curIndex + 2);

				// Skip the character after the backslash so we don't count the backslashed `"` as the end of our string
				this.index = curIndex + 2;

				// Skip the character after the backslash
				curIndex += 2;
				curCharacter = this.value[curIndex];
			} else {
				curIndex += 1;
				curCharacter = this.value[curIndex];
			}
		}

		// Exclude the ending `"` character
		rtn += this.value.slice(this.index, curIndex);

		this.index = curIndex + 1;

		// Using JSON.parse to evaluate the escaped characters
		return JSON.parse(`"${rtn}"`) as string;
	}

	/**
	When the "parseFromFirstRemaining" function can't figure out the data type
	of "str", then `parseUnknown` is used. It crams everything it sees
	into a String, until it finds a ',' or a '}' or it reaches the end of data.
	*/
	parseUnknown({ boolean = true }: { boolean?: boolean } = {}):
		| boolean
		| string {
		const END_OF_TOKEN = /[,\n}]/;

		const startIndex = this.index;
		let end = this.index;
		let cur = this.value[end]!;
		end += 1;

		while (cur !== undefined && !END_OF_TOKEN.test(cur)) {
			cur = this.value[end]!;
			end += 1;
		}

		if (cur === undefined && startIndex === end + 1) {
			throw new AppleScriptParseError(
				`Expected more characters, but reached end of input when parsing the input starting from position ${startIndex}.`
			);
		}

		const rtn = this.value.slice(this.index, end - 1);
		this.index = end - 1;

		if (boolean) {
			if (rtn === 'false') {
				return false;
			}

			if (rtn === 'true') {
				return true;
			}
		}

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
