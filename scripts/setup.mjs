import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
for (const filename of ['.env', '.env.runner']) {
  const template = await readFile(new URL(`${filename}.example`, root), 'utf8');
  const contents = template.replaceAll('GENERATED_BY_SETUP', () => randomBytes(24).toString('hex'));
  try {
    await writeFile(new URL(filename, root), contents, { flag: 'wx', mode: 0o600 });
    console.log(`Created local configuration in ${fileURLToPath(new URL(filename, root))}.`);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.log(`Existing ${filename} preserved; no credentials or settings were changed.`);
  }
}
