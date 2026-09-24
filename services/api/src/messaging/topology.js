/**
 * Idempotent broker topology.
 *
 * Calling this more than once is safe when the existing resources were
 * declared with the same types and arguments. RabbitMQ rejects an assertion
 * whose arguments differ (PRECONDITION_FAILED). That failure is intentional:
 * a silent recreate would hide a topology drift.
 *
 * Retry/replay is not part of this topology. A later milestone can add a
 * delay/retry exchange that dead-letters back onto the main queue, plus a
 * replay tool that republishes from the DLQ. M5 only declares the DLX and DLQ.
 */

/**
 * @param {ReturnType<import('../config/rabbitmq').loadRabbitmqConfig>} config
 */
function buildTopologyPlan(config) {
  return Object.freeze({
    exchanges: Object.freeze([
      Object.freeze({
        name: config.exchange,
        type: config.exchangeType,
        options: Object.freeze({ durable: true }),
      }),
      Object.freeze({
        name: config.deadLetterExchange,
        type: config.deadLetterExchangeType,
        options: Object.freeze({ durable: true }),
      }),
    ]),
    queues: Object.freeze([
      Object.freeze({
        name: config.systemQueue,
        options: Object.freeze({
          durable: true,
          arguments: Object.freeze({
            'x-dead-letter-exchange': config.deadLetterExchange,
            'x-dead-letter-routing-key': config.deadLetterRoutingKey,
          }),
        }),
      }),
      Object.freeze({
        name: config.systemDeadQueue,
        options: Object.freeze({ durable: true }),
      }),
    ]),
    bindings: Object.freeze([
      Object.freeze({
        queue: config.systemQueue,
        exchange: config.exchange,
        routingKey: config.routingKey,
      }),
      Object.freeze({
        queue: config.systemDeadQueue,
        exchange: config.deadLetterExchange,
        routingKey: config.deadLetterRoutingKey,
      }),
    ]),
  });
}

/**
 * @param {import('amqplib').Channel} channel
 * @param {ReturnType<import('../config/rabbitmq').loadRabbitmqConfig>} config
 */
async function assertTopology(channel, config) {
  const plan = buildTopologyPlan(config);

  for (const exchange of plan.exchanges) {
    await channel.assertExchange(exchange.name, exchange.type, exchange.options);
  }
  for (const queue of plan.queues) {
    await channel.assertQueue(queue.name, queue.options);
  }
  for (const binding of plan.bindings) {
    await channel.bindQueue(binding.queue, binding.exchange, binding.routingKey);
  }

  return plan;
}

module.exports = {
  buildTopologyPlan,
  assertTopology,
};
