const fs = require('fs');
const os = require('os');
const path = require('path');

describe('accounts', () => {
  let tmpFile;
  let accounts;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `mail-mcp-accounts-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify([
      { id: 'example', user: 'user@example.com', imap: { host: 'imap.example.com', port: 993 }, smtp: { host: 'smtp.example.com', port: 465 } }
    ]));
    process.env.MAIL_MCP_ACCOUNTS_PATH = tmpFile;
    process.env.MAILMCP_PASS_EXAMPLE = 'secret123';
    delete require.cache[require.resolve('../lib/accounts')];
    accounts = require('../lib/accounts');
  });

  afterEach(() => {
    fs.unlinkSync(tmpFile);
    delete process.env.MAIL_MCP_ACCOUNTS_PATH;
    delete process.env.MAILMCP_PASS_EXAMPLE;
  });

  it('derives the expected env var name from an id', () => {
    expect(accounts.envVarName('example')).toBe('MAILMCP_PASS_EXAMPLE');
    expect(accounts.envVarName('my-box.1')).toBe('MAILMCP_PASS_MY_BOX_1');
  });

  it('loads accounts and injects the password from the env var', () => {
    const list = accounts.loadAccounts();
    expect(list).toHaveLength(1);
    expect(list[0].user).toBe('user@example.com');
    expect(list[0].pass).toBe('secret123');
  });

  it('throws when the password env var is missing', () => {
    delete process.env.MAILMCP_PASS_EXAMPLE;
    expect(() => accounts.loadAccounts()).toThrow(/Missing password env var/);
  });

  it('getAccount returns the matching account', () => {
    const acc = accounts.getAccount('example');
    expect(acc.id).toBe('example');
  });

  it('getAccount throws a 404-tagged error for an unknown id', () => {
    try {
      accounts.getAccount('nope');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.status).toBe(404);
    }
  });
});
