const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'config', 'webhooks.sqlite');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    accountId TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    events TEXT NOT NULL,
    status TEXT NOT NULL,
    url TEXT NOT NULL,
    secret TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_webhooks_account ON webhooks(accountId);
`);

function rowToWebhook(row) {
  if (!row) return null;
  return { ...row, events: JSON.parse(row.events) };
}

function load() {
  return db.prepare('SELECT * FROM webhooks').all().map(rowToWebhook);
}

function list(accountId) {
  return db.prepare('SELECT * FROM webhooks WHERE accountId = ?').all(accountId).map(rowToWebhook);
}

function create(accountId, { name, url, events = ['message.received'], description = null, status = 'active' }) {
  const webhook = {
    id: crypto.randomUUID(),
    accountId,
    name,
    description,
    events,
    status,
    url,
    secret: crypto.randomBytes(32).toString('hex'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.prepare(`
    INSERT INTO webhooks (id, accountId, name, description, events, status, url, secret, createdAt, updatedAt)
    VALUES (@id, @accountId, @name, @description, @events, @status, @url, @secret, @createdAt, @updatedAt)
  `).run({ ...webhook, events: JSON.stringify(webhook.events) });
  return webhook;
}

function remove(accountId, id) {
  const info = db.prepare('DELETE FROM webhooks WHERE accountId = ? AND id = ?').run(accountId, id);
  return info.changes > 0;
}

function get(accountId, id) {
  return rowToWebhook(db.prepare('SELECT * FROM webhooks WHERE accountId = ? AND id = ?').get(accountId, id));
}

module.exports = { load, list, create, remove, get };
