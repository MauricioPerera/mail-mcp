const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');
const { getAccount } = require('./accounts');

const MAX_MESSAGE_SIZE = parseInt(process.env.MAIL_MCP_MAX_MESSAGE_SIZE || String(25 * 1024 * 1024), 10);

function imapClient(account) {
  return new ImapFlow({
    host: account.imap.host,
    port: account.imap.port,
    secure: account.imap.secure !== false,
    auth: { user: account.user, pass: account.pass },
    logger: false
  });
}

function smtpTransport(account) {
  return nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure !== false,
    auth: { user: account.user, pass: account.pass }
  });
}

async function withImap(accountId, fn) {
  const account = getAccount(accountId);
  const client = imapClient(account);
  await client.connect();
  try {
    return await fn(client, account);
  } finally {
    await client.logout().catch(() => {});
  }
}

function envelopeToSummary(msg) {
  return {
    uid: msg.uid,
    flags: Array.from(msg.flags || []),
    unseen: !(msg.flags && msg.flags.has('\\Seen')),
    size: msg.size,
    date: msg.envelope?.date,
    subject: msg.envelope?.subject,
    from: msg.envelope?.from?.[0]
      ? { name: msg.envelope.from[0].name || '', address: msg.envelope.from[0].address }
      : null,
    to: (msg.envelope?.to || []).map(t => ({ name: t.name || '', address: t.address })),
    messageId: msg.envelope?.messageId || null
  };
}

async function listFolders(accountId) {
  return withImap(accountId, async client => {
    const list = await client.list();
    return list.map(f => ({ path: f.path, name: f.name, specialUse: f.specialUse || null }));
  });
}

async function listMessages(accountId, folder, { limit = 20, page = 1 } = {}) {
  return withImap(accountId, async client => {
    const lock = await client.getMailboxLock(folder);
    try {
      const total = client.mailbox.exists;
      if (total === 0) return { data: [], pagination: { page, perPage: limit, total: 0 } };
      const end = total - (page - 1) * limit;
      const start = Math.max(1, end - limit + 1);
      if (end < 1) return { data: [], pagination: { page, perPage: limit, total } };
      const results = [];
      for await (const msg of client.fetch(`${start}:${end}`, { envelope: true, flags: true, size: true })) {
        results.push(envelopeToSummary(msg));
      }
      results.reverse();
      return { data: results, pagination: { page, perPage: limit, total } };
    } finally {
      lock.release();
    }
  });
}

async function getMessage(accountId, folder, uid) {
  return withImap(accountId, async client => {
    const lock = await client.getMailboxLock(folder);
    try {
      const msg = await client.fetchOne(uid, { envelope: true, flags: true, size: true, source: true }, { uid: true });
      if (!msg) throw Object.assign(new Error('Message not found'), { status: 404 });

      if (Buffer.isBuffer(msg.source) && msg.source.length > MAX_MESSAGE_SIZE) {
        return {
          ...envelopeToSummary(msg),
          plainBody: '',
          htmlBody: '',
          attachments: [],
          bodyTruncated: true,
          bodyTruncatedReason: `Message body exceeds ${MAX_MESSAGE_SIZE} bytes; not parsed to avoid excessive memory use.`
        };
      }

      const parsed = await simpleParser(msg.source);
      return {
        ...envelopeToSummary(msg),
        plainBody: parsed.text || '',
        htmlBody: parsed.html || '',
        attachments: (parsed.attachments || []).map((a, i) => ({
          id: String(i),
          filename: a.filename,
          contentType: a.contentType,
          sizeBytes: a.size
        })),
        bodyTruncated: false
      };
    } finally {
      lock.release();
    }
  });
}

async function searchMessages(accountId, folder, criteria) {
  return withImap(accountId, async client => {
    const lock = await client.getMailboxLock(folder);
    try {
      const uids = await client.search(criteria, { uid: true });
      const results = [];
      if (uids.length) {
        for await (const msg of client.fetch(uids, { envelope: true, flags: true, size: true }, { uid: true })) {
          results.push(envelopeToSummary(msg));
        }
      }
      return { data: results.reverse() };
    } finally {
      lock.release();
    }
  });
}

async function flagMessage(accountId, folder, uid, { add = [], remove = [] }) {
  return withImap(accountId, async client => {
    const lock = await client.getMailboxLock(folder);
    try {
      if (add.length) await client.messageFlagsAdd({ uid }, add, { uid: true });
      if (remove.length) await client.messageFlagsRemove({ uid }, remove, { uid: true });
      return { ok: true };
    } finally {
      lock.release();
    }
  });
}

async function moveMessage(accountId, folder, uid, targetFolder) {
  return withImap(accountId, async client => {
    const lock = await client.getMailboxLock(folder);
    try {
      await client.messageMove({ uid }, targetFolder, { uid: true });
      return { ok: true };
    } finally {
      lock.release();
    }
  });
}

async function deleteMessage(accountId, folder, uid) {
  return withImap(accountId, async client => {
    const lock = await client.getMailboxLock(folder);
    try {
      await client.messageFlagsAdd({ uid }, ['\\Deleted'], { uid: true });
      await client.messageDelete({ uid }, { uid: true });
      return { ok: true };
    } finally {
      lock.release();
    }
  });
}

async function sendEmail(accountId, { to, cc, bcc, subject, text, html, attachments }) {
  const account = getAccount(accountId);
  const transport = smtpTransport(account);
  const info = await transport.sendMail({ from: account.user, to, cc, bcc, subject, text, html, attachments });
  return { messageId: info.messageId };
}

async function getQuota(accountId) {
  return withImap(accountId, async client => {
    try {
      const quota = await client.getQuota('');
      return quota || { supported: false };
    } catch (e) {
      return { supported: false, reason: e.message };
    }
  });
}

module.exports = {
  imapClient, listFolders, listMessages, getMessage, searchMessages,
  flagMessage, moveMessage, deleteMessage, sendEmail, getQuota
};
