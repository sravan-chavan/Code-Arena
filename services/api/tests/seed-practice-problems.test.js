const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const seed = require('../src/migrations/008_seed_practice_problems');
const { toPracticeProblem } = require('../src/contests/question.service');

describe('Practice problem seed migration module', () => {
  it('is an idempotent development seed of standalone practice problems', () => {
    assert.equal(seed.id, '008');
    assert.equal(seed.name, 'seed_practice_problems');
    assert.equal(typeof seed.up, 'function');
    assert.equal(typeof seed.down, 'function');

    const source = fs.readFileSync(
      path.join(__dirname, '../src/migrations/008_seed_practice_problems.js'),
      'utf8',
    );
    assert.match(seed.up.toString(), /findPracticeDevelopmentSeedByTitle/);
    assert.match(source, /Hello CodeArena/);
    assert.match(source, /Sum of Two Numbers/);
    assert.match(source, /Reverse String/);
    assert.match(source, /aneradoc/);
  });
});

describe('Practice problem public mapping', () => {
  it('strips contest and seed metadata from student practice problems', () => {
    const problem = toPracticeProblem({
      id: '00000000-0000-4000-8000-000000000010',
      contestId: null,
      contestTitle: null,
      title: 'Hello CodeArena',
      description: 'Print Hello CodeArena',
      inputFormat: 'none',
      outputFormat: 'Hello CodeArena',
      constraints: 'exact',
      difficulty: 'easy',
      timeLimitSeconds: 2,
      memoryLimitMb: 128,
      sortOrder: 0,
      isPractice: true,
      isDevelopmentSeed: true,
      sampleInput: '',
      sampleOutput: 'Hello CodeArena',
    });

    assert.equal(problem.title, 'Hello CodeArena');
    assert.equal(problem.contestId, undefined);
    assert.equal(problem.contestTitle, undefined);
    assert.equal(problem.isPractice, undefined);
    assert.equal(problem.isDevelopmentSeed, undefined);
    assert.equal(problem.sampleOutput, 'Hello CodeArena');
  });
});
