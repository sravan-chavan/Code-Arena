const http = require('http');

const port = Number(process.env.PORT || 4001);

/**
 * Milestone 0 worker skeleton.
 * Milestone 5 keeps this process health-only. RabbitMQ connect, topology,
 * publish, and the architecture consumer live in the API process.
 * This process does not consume queues, call Judge0, or execute user code.
 */
const server = http.createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        service: 'worker',
        milestone: 0,
      }),
    );
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(port, '0.0.0.0', () => {
  console.log(`CodeArena worker health server listening on port ${port}`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
