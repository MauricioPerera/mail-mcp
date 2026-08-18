const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WEBHOOKS_PATH = path.join(__dirname, '..', 'config', 'webhooks.json');

function load() {
  if (!fs.existsSync(WEBHOOKS_PATH)) return [];
  return JSON.parse(fs.readFileSync(WEBHOOKS_PATH, 'utf8'));
}

function save(list) {
  fs.writeFileSync(WEBHOOKS_PATH, JSON.stringify(list, null, 2));
}

function list(accountId) {
  return load().filter(w => w.accountId === accountId);
}

function create(accountId, { name, url, events = ['message.received'], description = null, status = 'active' }) {
  const all = load();
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
  all.push(webhook);
  save(all);
  return webhook;
}

function remove(accountId, id) {
  const all = load();
  const idx = all.findIndex(w => w.accountId === accountId && w.id === id);
  if (idx === -1) return false;
  all.splice(idx, 1);
  save(all);
  return true;
}

function get(accountId, id) {
  return load().find(w => w.accountId === accountId && w.id === id) || null;
}

module.exports = { load, save, list, create, remove, get };
