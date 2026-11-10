import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkText, markdownFiles } from './docs.mjs';

test('rejects long prose and metadata while accepting the width boundary', () => {
	assert.equal(checkText('a'.repeat(100)).length, 0);
	assert.equal(checkText('ordinary words '.repeat(10)).length, 1);
	assert.equal(checkText('- Update Triggers: ' + 'trigger, '.repeat(284)).length, 1);
	assert.equal(checkText('words '.repeat(20) + 'https://example.com').length, 1);
});
test('preserves atomic Markdown and checks prose around tokens', () => {
	const link = '[reference](https://example.com/' + 'a'.repeat(120) + ')';
	assert.deepEqual(
		checkText(
			[
				'# ' + 'title '.repeat(30),
				'```js',
				'x'.repeat(200),
				'```',
				'    ' + 'x'.repeat(200),
				'| ' + 'cell '.repeat(40) + '|',
				link,
				'`' + 'x'.repeat(120) + '`'
			].join('\n')
		),
		[]
	);
	assert.equal(checkText('words '.repeat(20) + link).length, 1);
});
test('discovers hidden and new Markdown, excludes ignored and deleted files', () => {
	const directory = mkdtempSync(join(tmpdir(), 'docs-check-'));
	try {
		execFileSync('git', ['init', '-q', directory]);
		mkdirSync(join(directory, '.github'));
		for (const file of ['tracked.md', 'deleted.md']) writeFileSync(join(directory, file), 'text');
		execFileSync('git', ['add', '.'], { cwd: directory });
		rmSync(join(directory, 'deleted.md'));
		writeFileSync(join(directory, '.github/new file.md'), 'text');
		writeFileSync(join(directory, '.gitignore'), 'ignored.md\n');
		writeFileSync(join(directory, 'ignored.md'), 'text');
		assert.deepEqual(markdownFiles(directory).sort(), ['.github/new file.md', 'tracked.md']);
	} finally {
		rmSync(directory, { recursive: true });
	}
});
