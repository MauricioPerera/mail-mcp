const express = require('express');
const { z } = require('zod');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');

const mail = require('./lib/mailclient');
const { loadAccounts } = require('./lib/accounts');
const webhooksStore = require('./lib/webhooks-store');
const idleWatcher = require('./lib/idle-watcher');

const SERVICE_TOKEN = process.env.MAIL_MCP_API_TOKEN;
if (!SERVICE_TOKEN) throw new Error('Missing MAIL_MCP_API_TOKEN env var');

function buildServer() {
  const server = new McpServer({ name: 'self-hosted-mail-mcp', version: '1.0.0' });

  server.tool('list_mailboxes', 'List configured mailboxes', {}, async () => ({
    content: [{ type: 'text', text: JSON.stringify(loadAccounts().map(a => ({ resourceId: a.id, address: a.user }))) }]
  }));

  server.tool('list_folders', 'List folders in a mailbox', { accountId: z.string() }, async ({ accountId }) => ({
    content: [{ type: 'text', text: JSON.stringify(await mail.listFolders(accountId)) }]
  }));

  server.tool('list_messages', 'List messages in a folder', {
    accountId: z.string(), folder: z.string().default('INBOX'), limit: z.number().default(20), page: z.number().default(1)
  }, async ({ accountId, folder, limit, page }) => ({
    content: [{ type: 'text', text: JSON.stringify(await mail.listMessages(accountId, folder, { limit, page })) }]
  }));

  server.tool('get_message', 'Get a single message with full body', {
    accountId: z.string(), folder: z.string().default('INBOX'), uid: z.number()
  }, async ({ accountId, folder, uid }) => ({
    content: [{ type: 'text', text: JSON.stringify(await mail.getMessage(accountId, folder, uid)) }]
  }));

  server.tool('search_messages', 'Search messages using IMAP search criteria', {
    accountId: z.string(), folder: z.string().default('INBOX'), criteria: z.record(z.any())
  }, async ({ accountId, folder, criteria }) => ({
    content: [{ type: 'text', text: JSON.stringify(await mail.searchMessages(accountId, folder, criteria)) }]
  }));

  server.tool('send_email', 'Send an email from a mailbox', {
    accountId: z.string(), to: z.array(z.string()), cc: z.array(z.string()).optional(),
    bcc: z.array(z.string()).optional(), subject: z.string(), text: z.string().optional(), html: z.string().optional()
  }, async ({ accountId, ...body }) => ({
    content: [{ type: 'text', text: JSON.stringify(await mail.sendEmail(accountId, body)) }]
  }));

  server.tool('flag_message', 'Add/remove IMAP flags on a message', {
    accountId: z.string(), folder: z.string().default('INBOX'), uid: z.number(),
    add: z.array(z.string()).default([]), remove: z.array(z.string()).default([])
  }, async ({ accountId, folder, uid, add, remove }) => ({
    content: [{ type: 'text', text: JSON.stringify(await mail.flagMessage(accountId, folder, uid, { add, remove })) }]
  }));

  server.tool('move_message', 'Move a message to another folder', {
    accountId: z.string(), folder: z.string().default('INBOX'), uid: z.number(), targetFolder: z.string()
  }, async ({ accountId, folder, uid, targetFolder }) => ({
    content: [{ type: 'text', text: JSON.stringify(await mail.moveMessage(accountId, folder, uid, targetFolder)) }]
  }));

  server.tool('delete_message', 'Delete a message', {
    accountId: z.string(), folder: z.string().default('INBOX'), uid: z.number()
  }, async ({ accountId, folder, uid }) => ({
    content: [{ type: 'text', text: JSON.stringify(await mail.deleteMessage(accountId, folder, uid)) }]
  }));

  server.tool('get_quota', 'Get mailbox quota (if supported by server)', { accountId: z.string() }, async ({ accountId }) => ({
    content: [{ type: 'text', text: JSON.stringify(await mail.getQuota(accountId)) }]
  }));

  server.tool('create_webhook', 'Create a webhook fired on message.received', {
    accountId: z.string(), name: z.string(), url: z.string(), description: z.string().optional()
  }, async ({ accountId, name, url, description }) => {
    const webhook = webhooksStore.create(accountId, { name, url, description, events: ['message.received'] });
    await idleWatcher.ensureWatcher(accountId);
    return { content: [{ type: 'text', text: JSON.stringify(webhook) }] };
  });

  server.tool('list_webhooks', 'List webhooks for a mailbox', { accountId: z.string() }, async ({ accountId }) => ({
    content: [{ type: 'text', text: JSON.stringify(webhooksStore.list(accountId)) }]
  }));

  server.tool('delete_webhook', 'Delete a webhook', { accountId: z.string(), webhookId: z.string() }, async ({ accountId, webhookId }) => {
    const removed = webhooksStore.remove(accountId, webhookId);
    idleWatcher.stopWatcherIfNoWebhooks(accountId);
    return { content: [{ type: 'text', text: JSON.stringify({ removed }) }] };
  });

  return server;
}

const app = express();
app.use(express.json());

app.post('/', async (req, res) => {
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${SERVICE_TOKEN}`) return res.status(401).json({ error: 'unauthorized' });

  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

module.exports = app;
