#!/usr/bin/env node
/**
 * Publish one codearena.execution.requested message using the same producer
 * path as the API (`@codearena/messaging` publish).
 *
 * This is a manual M7 helper. It does not add an HTTP execution API (M8).
 *
 * Host (from services/api, stack up, RabbitMQ reachable):
 *   node ../../scripts/publish-execution.js
 *   node ../../scripts/publish-execution.js --case compile
 *   node ../../scripts/publish-execution.js --case runtime
 *   node ../../scripts/publish-execution.js --case timeout
 *
 * API container:
 *   docker exec -i codearena-api node - < scripts/publish-execution.js
 *   docker exec -i -e EXECUTION_CASE=compile codearena-api node - < scripts/publish-execution.js
 *
 * Watch the result in Worker logs (results are not persisted in M7):
 *   make docker-logs-worker-codearena
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

function loadRootEnv() {
  const candidates = [
    path.join(__dirname, '..', '.env'),
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '..', '..', '.env'),
  ];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) {
      continue;
    }
    const text = fs.readFileSync(envPath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const separator = trimmed.indexOf('=');
      if (separator === -1) {
        continue;
      }
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
    return;
  }
}

function caseName() {
  const flagIndex = process.argv.indexOf('--case');
  if (flagIndex !== -1 && process.argv[flagIndex + 1]) {
    return process.argv[flagIndex + 1];
  }
  return process.env.EXECUTION_CASE || 'success';
}

function languageId() {
  const parsed = Number.parseInt(process.env.JUDGE0_LANGUAGE_ID || '71', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 71;
}

function buildPayload(name) {
  const jobId = randomUUID();
  if (name === 'compile') {
    return {
      jobId,
      languageId: languageId(),
      sourceCode: 'def (',
      note: 'm7-manual-compile',
    };
  }
  if (name === 'runtime') {
    return {
      jobId,
      languageId: languageId(),
      sourceCode: 'print(undefined_name)',
      note: 'm7-manual-runtime',
    };
  }
  if (name === 'timeout') {
    return {
      jobId,
      languageId: languageId(),
      sourceCode: 'while True:\n    pass\n',
      cpuTimeLimit: 1,
      note: 'm7-manual-timeout',
    };
  }
  return {
    jobId,
    languageId: languageId(),
    sourceCode: 'print("Hello CodeArena")',
    note: 'm7-manual-success',
  };
}

async function main() {
  loadRootEnv();
  if (!process.env.CODEARENA_SERVICE_NAME) {
    process.env.CODEARENA_SERVICE_NAME = 'api';
  }

  const messaging = require('@codearena/messaging');
  const selected = caseName();
  const payload = buildPayload(selected);

  await messaging.initMessaging({ serviceName: process.env.CODEARENA_SERVICE_NAME });
  try {
    const published = await messaging.publish({
      type: messaging.MESSAGE_TYPES.EXECUTION_REQUESTED,
      payload,
    });
    console.log(`Published execution.requested case=${selected} messageId=${published.messageId} jobId=${payload.jobId} languageId=${payload.languageId}`);
    console.log('Watch Worker logs for Judge0 status and stdoutPreview. Source code is not logged.');
  } finally {
    await messaging.closeMessaging();
  }
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
