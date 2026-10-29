import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const project = `riqvo-test-${randomUUID().slice(0, 8)}`;
const artifactDir = await mkdtemp(join(tmpdir(), 'riqvo-artifacts-'));
const env = {
  ...process.env,
  RIQVO_TEST_MYSQL_PASSWORD: randomBytes(24).toString('hex'),
  RIQVO_TEST_MYSQL_ROOT_PASSWORD: randomBytes(24).toString('hex'),
};
const composeArgs = ['compose', '-p', project, '-f', 'compose.test.yaml'];

/** 运行公共命令，保留失败状态，并仅通过环境变量传递凭据。 */
async function command(executable, args, environment = env, capture = false) {
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      env: environment,
      stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    });
    let output = '';
    child.stdout?.on('data', (data) => {
      output += data.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve(output.trim()) : reject(new Error(`${executable} exited with ${code}`)),
    );
  });
}

try {
  await command(process.execPath, [process.env.npm_execpath, 'build']);
  await command('docker', [...composeArgs, 'up', '-d', '--wait', '--wait-timeout', '120']);
  const mysqlAddress = await command(
    'docker',
    [...composeArgs, 'port', 'mysql', '3306'],
    env,
    true,
  );
  const redisAddress = await command(
    'docker',
    [...composeArgs, 'port', 'redis', '6379'],
    env,
    true,
  );
  await command(
    process.execPath,
    ['--test', '--test-concurrency=1', 'tests/integration/foundation.test.mjs'],
    {
      ...env,
      RIQVO_INTEGRATION: '1',
      MYSQL_HOST: '127.0.0.1',
      MYSQL_PORT: mysqlAddress.split(':').at(-1),
      MYSQL_DATABASE: 'riqvo_test',
      MYSQL_USER: 'riqvo_test',
      MYSQL_PASSWORD: env.RIQVO_TEST_MYSQL_PASSWORD,
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: redisAddress.split(':').at(-1),
      REDIS_PASSWORD: '',
      ARTIFACT_DIR: artifactDir,
    },
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  try {
    await command('docker', [...composeArgs, 'down', '--volumes', '--remove-orphans']);
  } catch {
    console.error(`Could not clean up the isolated test project: ${project}`);
    process.exitCode = 1;
  }
  await rm(artifactDir, { recursive: true, force: true });
}
