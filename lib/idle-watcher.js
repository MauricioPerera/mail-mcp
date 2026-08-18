const crypto = require('crypto');
const { simpleParser } = require('mailparser');
const { getAccount } = require('./accounts');
const { imapClient } = require('./mailclient');
const webhooksStore = require('./webhooks-store');

const active = new Map(); // accountId -> { stop: fn }

const MAX_MESSAGE_SIZE = parseInt(process.env.MAIL_MCP_MAX_MESSAGE_SIZE || String(25 * 1024 * 1024), 10);
const RETRY_DELAYS_MS = [1000, 3000, 10000, 30000, 60000];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function deliverWithRetry(webhook, payload) {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch(webhook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${webhook.secret}` },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        console.log(`[webhook] ${webhook.accountId} -> ${webhook.url} : ${res.status} (attempt ${attempt + 1})`);
        return;
      }
      console.error(`[webhook] ${webhook.accountId} -> ${webhook.url} : HTTP ${res.status} (attempt ${attempt + 1})`);
    } catch (e) {
      console.error(`[webhook] ${webhook.accountId} -> ${webhook.url} : ${e.message} (attempt ${attempt + 1})`);
    }
    if (attempt < RETRY_DELAYS_MS.length) {
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  console.error(`[webhook] ${webhook.accountId} -> ${webhook.url} : giving up after ${RETRY_DELAYS_MS.length + 1} attempts`);
}

async function dispatch(accountId, msg) {
  const webhooks = webhooksStore.list(accountId).filter(w => w.status === 'active' && w.events.includes('message.received'));
  if (!webhooks.length) return;

  const account = getAccount(accountId);
  const oversized = Buffer.isBuffer(msg.source) && msg.source.length > MAX_MESSAGE_SIZE;

  let plainBody = '';
  let htmlBody = '';
  let attachments = [];

  if (oversized) {
    console.error(`[idle] ${accountId}: message ${msg.envelope?.messageId} exceeds ${MAX_MESSAGE_SIZE} bytes, skipping body parse`);
  } else {
    const parsed = await simpleParser(msg.source);
    plainBody = parsed.text || '';
    htmlBody = parsed.html || '';
    attachments = (parsed.attachments || []).map(a => ({ filename: a.filename, contentType: a.contentType, sizeBytes: a.size }));
  }

  const payload = {
    id: crypto.randomUUID(),
    event: 'message.received',
    timestamp: new Date().toISOString(),
    data: {
      mailboxAddress: account.user,
      from: msg.envelope?.from?.[0]?.address || null,
      to: (msg.envelope?.to || []).map(t => t.address),
      cc: (msg.envelope?.cc || []).map(t => t.address),
      subject: msg.envelope?.subject || '',
      date: msg.envelope?.date || null,
      messageId: msg.envelope?.messageId || null,
      plainBody,
      htmlBody,
      attachments,
      bodyTruncated: oversized
    }
  };

  for (const wh of webhooks) {
    deliverWithRetry(wh, payload).catch(e => console.error('[webhook] unexpected delivery error', e.message));
  }
}

async function watchAccount(accountId) {
  const account = getAccount(accountId);
  let stopped = false;
  let currentClient = null;

  (async function loop() {
    let backoff = 2000;
    while (!stopped) {
      try {
        const client = imapClient(account);
        currentClient = client;
        await client.connect();
        await client.mailboxOpen('INBOX');
        backoff = 2000;

        client.on('exists', async (data) => {
          try {
            const seqStart = (data.prevCount || 0) + 1;
            const seqEnd = data.count;
            if (seqEnd < seqStart) return;
            for await (const msg of client.fetch(`${seqStart}:${seqEnd}`, { envelope: true, source: true, uid: true })) {
              dispatch(accountId, msg).catch(e => console.error('[webhook] dispatch error', e.message));
            }
          } catch (e) {
            console.error('[idle] exists handler error', e.message);
          }
        });

        while (!stopped && client.usable) {
          await client.idle();
        }
        await client.logout().catch(() => {});
      } catch (e) {
        console.error(`[idle] ${accountId} connection error, retrying in ${backoff}ms:`, e.message);
        await new Promise(r => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, 60000);
      }
    }
  })();

  return {
    stop() {
      stopped = true;
      if (currentClient) currentClient.close();
    }
  };
}

async function ensureWatcher(accountId) {
  if (active.has(accountId)) return;
  const handle = await watchAccount(accountId);
  active.set(accountId, handle);
  console.log(`[idle] started watcher for ${accountId}`);
}

function stopWatcherIfNoWebhooks(accountId) {
  const remaining = webhooksStore.list(accountId).filter(w => w.status === 'active');
  if (remaining.length === 0 && active.has(accountId)) {
    active.get(accountId).stop();
    active.delete(accountId);
    console.log(`[idle] stopped watcher for ${accountId}`);
  }
}

async function bootstrapAll() {
  const all = webhooksStore.load();
  const accountIds = [...new Set(all.filter(w => w.status === 'active').map(w => w.accountId))];
  for (const id of accountIds) {
    await ensureWatcher(id);
  }
}

module.exports = { ensureWatcher, stopWatcherIfNoWebhooks, bootstrapAll };
