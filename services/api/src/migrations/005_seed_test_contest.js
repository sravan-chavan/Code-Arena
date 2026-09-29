/**
 * Development/test contest used for the Judge0 execution vertical slice.
 *
 * Idempotent: if a development-seed contest titled "Test" already exists,
 * this migration does nothing. It is not a substitute for Admin Create Contest.
 */

const contestRepository = require('../repositories/contest.repository');
const questionRepository = require('../repositories/question.repository');
const userRepository = require('../repositories/user.repository');
const { normalizeEmail } = require('../auth/email');

const TEST_TITLE = 'Test';

async function insertQuestion(client, contestId, spec, sortOrder) {
  const question = await questionRepository.create({
    contestId,
    sortOrder,
    ...spec.question,
  }, client);
  for (const [index, testCase] of spec.testCases.entries()) {
    await questionRepository.createTestCase({
      questionId: question.id,
      sortOrder: index,
      ...testCase,
    }, client);
  }
  return question;
}

module.exports = {
  id: '005',
  name: 'seed_test_contest',
  up: async (client) => {
    const existing = await contestRepository.findDevelopmentSeedByTitle(TEST_TITLE, client);
    if (existing) {
      return;
    }

    const admin = await userRepository.findByEmail(normalizeEmail('admin@codearena.com'), client);
    if (!admin) {
      throw new Error('Cannot seed Test contest: default admin is missing (run migration 003 first)');
    }

    const contest = await contestRepository.create({
      title: TEST_TITLE,
      description: 'Development contest for end-to-end Judge0 execution. Created by migration 005.',
      status: 'running',
      startTime: new Date().toISOString(),
      durationMinutes: 180,
      createdBy: admin.id,
      isDevelopmentSeed: true,
    }, client);

    await insertQuestion(client, contest.id, {
      question: {
        title: 'Hello World',
        description: 'Print the exact text Hello CodeArena.',
        inputFormat: 'There is no input.',
        outputFormat: 'Print Hello CodeArena followed by a newline.',
        constraints: 'Output must match exactly.',
        difficulty: 'easy',
        timeLimitSeconds: 2,
        memoryLimitMb: 128,
      },
      testCases: [
        { stdin: '', expectedOutput: 'Hello CodeArena', isHidden: false },
        { stdin: '', expectedOutput: 'Hello CodeArena', isHidden: true },
      ],
    }, 0);

    await insertQuestion(client, contest.id, {
      question: {
        title: 'Sum of Two Numbers',
        description: 'Read two integers and print their sum.',
        inputFormat: 'A single line containing two space-separated integers A and B.',
        outputFormat: 'Print A + B.',
        constraints: '-1000 ≤ A, B ≤ 1000',
        difficulty: 'easy',
        timeLimitSeconds: 2,
        memoryLimitMb: 128,
      },
      testCases: [
        { stdin: '5 7', expectedOutput: '12', isHidden: false },
        { stdin: '0 0', expectedOutput: '0', isHidden: true },
        { stdin: '-3 10', expectedOutput: '7', isHidden: true },
      ],
    }, 1);

    await insertQuestion(client, contest.id, {
      question: {
        title: 'Reverse String',
        description: 'Read a string and print it reversed.',
        inputFormat: 'A single line containing a string S without spaces.',
        outputFormat: 'Print the reverse of S.',
        constraints: '1 ≤ |S| ≤ 100. S contains only lowercase English letters.',
        difficulty: 'easy',
        timeLimitSeconds: 2,
        memoryLimitMb: 128,
      },
      testCases: [
        { stdin: 'codearena', expectedOutput: 'aneradoc', isHidden: false },
        { stdin: 'ab', expectedOutput: 'ba', isHidden: true },
      ],
    }, 2);
  },
  down: async (client) => {
    await client.query(
      `DELETE FROM contests WHERE is_development_seed = TRUE AND title = $1`,
      [TEST_TITLE],
    );
  },
};
