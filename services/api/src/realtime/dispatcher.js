/**
 * In-process domain event bus.
 * Business code publishes here. The WebSocket gateway is one subscriber.
 * This is not a second RabbitMQ topology and it is not durable.
 */

const handlers = new Set();

function publish(item) {
  for (const handler of handlers) {
    try {
      handler(item);
    } catch (err) {
      console.error(`[API] Realtime dispatcher handler failed: ${err.message}`);
    }
  }
}

function subscribe(handler) {
  handlers.add(handler);
  return function unsubscribe() {
    handlers.delete(handler);
  };
}

function handlerCount() {
  return handlers.size;
}

function clear() {
  handlers.clear();
}

module.exports = {
  publish,
  subscribe,
  handlerCount,
  clear,
};
