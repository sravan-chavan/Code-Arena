const express = require('express');

const app = express();
const port = Number(process.env.PORT || 4000);

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'api',
    milestone: 0,
  });
});

app.get('/', (_req, res) => {
  res.status(200).json({
    service: 'api',
    message: 'CodeArena API skeleton (Milestone 0)',
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`CodeArena API listening on port ${port}`);
});
