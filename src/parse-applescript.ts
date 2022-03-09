import { Buffer } from 'node:buffer';

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

		return this.parseUndefined();
	}

	/**
	Parses an AppleScript "alias", which is really just a reference to a
	location on the filesystem, but formatted kinda weirdly.
	*/
	parseAlias() {
		this.index += 6;
		return '/Volumes/' + this.parseString().replace(/:/g, '/');
	}

	/**
	Parses an AppleScript date into a native JavaScript Date instance.
	*/
	parseDate() {
		this.index += 5;
		return new Date(this.parseString().replace(' at', ','));
	}

	/**
	Parses an AppleScript Array. Which looks like {}, instead of JavaScript's [].
	*/
	parseArray(): unknown[] {
		const rtn = [];

		let cur = this.value[++this.index];
		while (cur !== '}') {
			rtn.push(this.parseFromFirstRemaining());
			if (this.value[this.index] === ',') this.index += 2;
			cur = this.value[this.index];
		}

		this.index += 1;

		return rtn;
	}

	/**
	Parses an AppleScript Number into a native JavaScript Number instance.
	*/
	parseNumber() {
		return Number(this.parseUndefined());
	}

	/**
	Parses «data » results into native Buffer instances.
	*/
	parseData() {
		let body = this.parseUndefined();
		body = body.slice(6, -1);
		const type = body.slice(0, 4);
		body = body.slice(4, body.length);
		const buf = Buffer.alloc(body.length / 2);
		let count = 0;
		for (let i = 0, l = body.length; i < l; i += 2) {
			buf[count++] = Number.parseInt(body[i]! + body[i + 1]!, 16);
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
		let end = ++this.index;
		let cur = this.value[end++];
		while (cur !== '"') {
			if (cur === '\\') {
				rtn += this.value.slice(this.index, end - 1);
				this.index = end++;
			}

			cur = this.value[end++];
		}

		rtn += this.value.slice(this.index, end - 1);
		this.index = end;
		return rtn;
	}

	/**
	When the "parseFromFirstRemaining" function can't figure out the data type
	of "str", then the UndefinedParser is used. It crams everything it sees
	into a String, until it finds a ',' or a '}' or it reaches the end of data.
	*/
	parseUndefined() {
		const END_OF_TOKEN = /[,\n}]/;

		let end = this.index;
		let cur = this.value[end++]!;

		while (cur !== undefined && !END_OF_TOKEN.test(cur)) {
			cur = this.value[end++]!;
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
