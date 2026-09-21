const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const mode = process.argv[2] || 'unit';
const testsDir = path.join(__dirname, '..', 'tests');

function collect(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collect(fullPath));
    } else if (entry.name.endsWith('.test.js')) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function isIntegration(file) {
  return file.split(path.sep).includes('integration');
}

function runNodeTest(files, extraArgs = []) {
  return new Promise((resolve, reject) => {
    if (files.length === 0) {
      reject(new Error('No tests found'));
      return;
    }
    const child = spawn(
      process.execPath,
      ['--test', '--test-timeout=20000', ...extraArgs, ...files],
      {
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'test' },
      },
    );
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`tests killed by ${signal}`));
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`tests exited with code ${code}`));
    });
  });
}

async function main() {
  const allFiles = collect(testsDir);
  const unitFiles = allFiles.filter((file) => !isIntegration(file));
  const dbFiles = allFiles.filter(isIntegration);

  if (mode === 'db') {
    await runNodeTest(dbFiles, ['--test-concurrency=1']);
    return;
  }
  if (mode === 'all') {
    await runNodeTest(unitFiles);
    await runNodeTest(dbFiles, ['--test-concurrency=1']);
    return;
  }
  await runNodeTest(unitFiles);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
