/**
 * API consumer for execution progress on codearena.execution.results.
 *
 * The API remains producer-only for the execution request queue. The Worker
 * publishes started and completed events. This consumer persists them and the
 * realtime notifier fans the outcome out to WebSocket subscribers.
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
    if (message.type === MESSAGE_TYPES.EXECUTION_STARTED) {
      await submissionService.markEvaluating(message.payload);
      return;
    }
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
