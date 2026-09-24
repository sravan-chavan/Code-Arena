/**
 * Architecture probe handler.
 *
 * Proves the consumer can invoke a handler and choose ACK vs reject.
 * `payload.disposition === 'fail'` is an intentional failure used by tests
 * and operational checks. It is not a business error and not a retry policy.
 *
 * This handler must not call Judge0, touch PostgreSQL, or ack the AMQP message.
 *
 * @param {{ messageId: string, type: string, version: number, occurredAt: string, payload: Record<string, unknown> }} message
 */
async function handleSystemTest(message) {
  if (message.payload && message.payload.disposition === 'fail') {
    const error = new Error('System test handler intentionally failed');
    error.code = 'SYSTEM_TEST_FAILED';
    throw error;
  }
}

module.exports = {
  handleSystemTest,
};
