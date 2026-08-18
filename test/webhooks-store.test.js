process.env.MAIL_MCP_WEBHOOKS_DB_PATH = ':memory:';
const webhooksStore = require('../lib/webhooks-store');

describe('webhooks-store', () => {
  beforeEach(() => {
    for (const w of webhooksStore.load()) {
      webhooksStore.remove(w.accountId, w.id);
    }
  });

  it('creates a webhook with generated id and secret', () => {
    const wh = webhooksStore.create('acc1', { name: 'test', url: 'https://example.com/hook' });
    expect(wh.id).toBeTruthy();
    expect(wh.secret).toHaveLength(64);
    expect(wh.events).toEqual(['message.received']);
    expect(wh.status).toBe('active');
  });

  it('lists webhooks scoped to an account', () => {
    webhooksStore.create('acc1', { name: 'a', url: 'https://example.com/a' });
    webhooksStore.create('acc2', { name: 'b', url: 'https://example.com/b' });
    expect(webhooksStore.list('acc1')).toHaveLength(1);
    expect(webhooksStore.list('acc2')).toHaveLength(1);
    expect(webhooksStore.list('acc3')).toHaveLength(0);
  });

  it('removes a webhook and returns false for an unknown id', () => {
    const wh = webhooksStore.create('acc1', { name: 'a', url: 'https://example.com/a' });
    expect(webhooksStore.remove('acc1', wh.id)).toBe(true);
    expect(webhooksStore.list('acc1')).toHaveLength(0);
    expect(webhooksStore.remove('acc1', 'unknown-id')).toBe(false);
  });

  it('get returns null for a non-existent webhook', () => {
    expect(webhooksStore.get('acc1', 'unknown-id')).toBeNull();
  });

  it('load returns webhooks across all accounts', () => {
    webhooksStore.create('acc1', { name: 'a', url: 'https://example.com/a' });
    webhooksStore.create('acc2', { name: 'b', url: 'https://example.com/b' });
    expect(webhooksStore.load()).toHaveLength(2);
  });
});
