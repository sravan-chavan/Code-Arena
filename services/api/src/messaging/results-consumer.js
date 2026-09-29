/**
 * API consumer for codearena.execution.completed.
 *
 * The API remains producer-only for the execution request queue. This consumer
 * only reads the results queue so the browser can poll persisted Judge0 outcomes.
 */

const {
  consume,
  loadRabbitmqConfig,
  MESSAGE_TYPES,
  MessageContractError,
} = require('./index');
const submissionService = require('../submissions/submission.service');

async function startExecutionResultsConsumer() {
  const rabbit = loadRabbitmqConfig();
  const consumer = await consume(rabbit.executionResultQueue, async (message) => {
    if (message.type !== MESSAGE_TYPES.EXECUTION_COMPLETED) {
      throw new MessageContractError(
        `Results queue received unsupported type: ${message.type}`,
      );
    }
    await submissionService.applyExecutionResult(message.payload);
  });
  console.log(
    `[API] Execution results consumer active queue=${rabbit.executionResultQueue} consumerTag=${consumer.consumerTag}`,
  );
  return consumer;
}

module.exports = {
  startExecutionResultsConsumer,
};
