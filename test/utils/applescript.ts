import { execa, execaSync } from 'execa';

export async function runAppleScript(script: string) {
	const { stdout } = await execa('osascript', ['-ss', '-e', script]);

	return stdout;
}

export function runAppleScriptSync(script: string) {
	const { stdout } = execaSync('osascript', ['-ss', '-e', script]);

	return stdout;
}
