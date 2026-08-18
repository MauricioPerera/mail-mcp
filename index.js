const express = require('express');
const restApi = require('./rest-server');
const mcpApi = require('./mcp-server');
const idleWatcher = require('./lib/idle-watcher');

const app = express();
app.use('/mcp', mcpApi);
app.use('/', restApi);

const PORT = process.env.MAIL_MCP_PORT || 4900;

app.listen(PORT, '127.0.0.1', async () => {
  console.log(`mail-mcp listening on 127.0.0.1:${PORT}`);
  await idleWatcher.bootstrapAll();
});
