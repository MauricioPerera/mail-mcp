const express = require('express');
const mail = require('./lib/mailclient');
const { loadAccounts, getAccount } = require('./lib/accounts');
const webhooksStore = require('./lib/webhooks-store');
const idleWatcher = require('./lib/idle-watcher');

const SERVICE_TOKEN = process.env.MAIL_MCP_API_TOKEN;
if (!SERVICE_TOKEN) throw new Error('Missing MAIL_MCP_API_TOKEN env var');

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${SERVICE_TOKEN}`) return res.status(401).json({ code: 'ERR_UNAUTHORIZED', error: 'Missing or invalid credentials.' });
  next();
});

function wrap(fn) {
  return async (req, res) => {
    try {
      const result = await fn(req, res);
      if (!res.headersSent) res.json({ data: result });
    } catch (e) {
      const status = e.status || 500;
      res.status(status).json({ code: status === 404 ? 'ERR_RESOURCE_NOT_FOUND' : 'ERR_INTERNAL', error: e.message });
    }
  };
}

app.get('/api/v1/mailboxes', wrap(async () => {
  return loadAccounts().map(a => ({ resourceId: a.id, address: a.user }));
}));

app.get('/api/v1/mailboxes/:id/folders', wrap(async req => mail.listFolders(req.params.id)));

app.get('/api/v1/mailboxes/:id/folders/:folder/messages', wrap(async req => {
  const { limit, page } = req.query;
  return mail.listMessages(req.params.id, req.params.folder, {
    limit: limit ? parseInt(limit) : 20,
    page: page ? parseInt(page) : 1
  });
}));

app.get('/api/v1/mailboxes/:id/folders/:folder/messages/:uid', wrap(async req =>
  mail.getMessage(req.params.id, req.params.folder, parseInt(req.params.uid))
));

app.post('/api/v1/mailboxes/:id/folders/:folder/messages/search', wrap(async req =>
  mail.searchMessages(req.params.id, req.params.folder, req.body)
));

app.patch('/api/v1/mailboxes/:id/folders/:folder/messages/:uid', wrap(async req =>
  mail.flagMessage(req.params.id, req.params.folder, parseInt(req.params.uid), req.body)
));

app.post('/api/v1/mailboxes/:id/folders/:folder/messages/:uid/move', wrap(async req =>
  mail.moveMessage(req.params.id, req.params.folder, parseInt(req.params.uid), req.body.targetFolder)
));

app.delete('/api/v1/mailboxes/:id/folders/:folder/messages/:uid', wrap(async req =>
  mail.deleteMessage(req.params.id, req.params.folder, parseInt(req.params.uid))
));

app.post('/api/v1/mailboxes/:id/send', wrap(async req => mail.sendEmail(req.params.id, req.body)));

app.get('/api/v1/mailboxes/:id/quota', wrap(async req => mail.getQuota(req.params.id)));

app.get('/api/v1/mailboxes/:id/webhooks', wrap(async req => webhooksStore.list(req.params.id)));

app.post('/api/v1/mailboxes/:id/webhooks', wrap(async (req, res) => {
  getAccount(req.params.id);
  const webhook = webhooksStore.create(req.params.id, req.body);
  await idleWatcher.ensureWatcher(req.params.id);
  res.status(201).json({ data: webhook });
}));

app.delete('/api/v1/mailboxes/:id/webhooks/:webhookId', wrap(async (req, res) => {
  const removed = webhooksStore.remove(req.params.id, req.params.webhookId);
  if (!removed) return res.status(404).json({ code: 'ERR_RESOURCE_NOT_FOUND', error: 'Webhook not found' });
  idleWatcher.stopWatcherIfNoWebhooks(req.params.id);
  res.json({ data: { ok: true } });
}));

module.exports = app;
