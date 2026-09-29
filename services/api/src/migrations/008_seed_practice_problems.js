/**
 * Development practice catalog used by the Student Practice Area.
 *
 * Independent of the contest "Test" seed. Idempotent: each title is inserted
 * only when a development-seed practice problem with that title is missing.
 */

const questionRepository = require('../repositories/question.repository');

const PROBLEMS = [
  {
    title: 'Hello CodeArena',
    description: 'Print the exact text Hello CodeArena. This is a practice problem and does not belong to a contest.',
    inputFormat: 'There is no input.',
    outputFormat: 'Print Hello CodeArena followed by a newline.',
    constraints: 'Output must match exactly.',
    difficulty: 'easy',
    timeLimitSeconds: 2,
    memoryLimitMb: 128,
    testCases: [
      { stdin: '', expectedOutput: 'Hello CodeArena', isHidden: false },
      { stdin: '', expectedOutput: 'Hello CodeArena', isHidden: true },
    ],
  },
  {
    title: 'Sum of Two Numbers',
    description: 'Read two integers and print their sum. This is a practice problem and does not belong to a contest.',
    inputFormat: 'A single line containing two space-separated integers A and B.',
    outputFormat: 'Print A + B.',
    constraints: '-1000 ≤ A, B ≤ 1000',
    difficulty: 'easy',
    timeLimitSeconds: 2,
    memoryLimitMb: 128,
    testCases: [
      { stdin: '5 7', expectedOutput: '12', isHidden: false },
      { stdin: '0 0', expectedOutput: '0', isHidden: true },
      { stdin: '-3 10', expectedOutput: '7', isHidden: true },
    ],
  },
  {
    title: 'Reverse String',
    description: 'Read a string and print it reversed. This is a practice problem and does not belong to a contest.',
    inputFormat: 'A single line containing a string S without spaces.',
    outputFormat: 'Print the reverse of S.',
    constraints: '1 ≤ |S| ≤ 100. S contains only lowercase English letters.',
    difficulty: 'easy',
    timeLimitSeconds: 2,
    memoryLimitMb: 128,
    testCases: [
      { stdin: 'codearena', expectedOutput: 'aneradoc', isHidden: false },
      { stdin: 'ab', expectedOutput: 'ba', isHidden: true },
    ],
  },
];

async function insertPracticeProblem(client, spec, sortOrder) {
  const question = await questionRepository.createPractice({
    isDevelopmentSeed: true,
    sortOrder,
    title: spec.title,
    description: spec.description,
    inputFormat: spec.inputFormat,
    outputFormat: spec.outputFormat,
    constraints: spec.constraints,
    difficulty: spec.difficulty,
    timeLimitSeconds: spec.timeLimitSeconds,
    memoryLimitMb: spec.memoryLimitMb,
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
  id: '008',
  name: 'seed_practice_problems',
  up: async (client) => {
    for (const spec of PROBLEMS) {
      const existing = await questionRepository.findPracticeDevelopmentSeedByTitle(spec.title, client);
      if (existing) {
        continue;
      }
      const sortOrder = await questionRepository.nextPracticeSortOrder(client);
      await insertPracticeProblem(client, spec, sortOrder);
    }
  },
  down: async (client) => {
    await client.query(
      `DELETE FROM questions
       WHERE is_practice = TRUE AND is_development_seed = TRUE`,
    );
  },
};
