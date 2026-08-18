const fs = require('fs');
const path = require('path');

const ACCOUNTS_PATH = path.join(__dirname, '..', 'config', 'accounts.json');

function envVarName(id) {
  return `MAILMCP_PASS_${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}

function loadAccounts() {
  const raw = fs.readFileSync(ACCOUNTS_PATH, 'utf8');
  const accounts = JSON.parse(raw);
  return accounts.map(acc => {
    const envVar = envVarName(acc.id);
    const pass = process.env[envVar];
    if (!pass) throw new Error(`Missing password env var ${envVar} for mailbox "${acc.id}"`);
    return { ...acc, pass };
  });
}

function getAccount(id) {
  const accounts = loadAccounts();
  const acc = accounts.find(a => a.id === id);
  if (!acc) throw Object.assign(new Error(`Unknown mailbox id: ${id}`), { status: 404 });
  return acc;
}

module.exports = { loadAccounts, getAccount };
