const {
  sendEmailSchema, flagSchema, moveSchema, createWebhookSchema, listMessagesQuerySchema
} = require('../lib/schemas');

describe('sendEmailSchema', () => {
  it('accepts a valid payload with text', () => {
    const result = sendEmailSchema.safeParse({ to: ['a@example.com'], subject: 'hi', text: 'body' });
    expect(result.success).toBe(true);
  });

  it('accepts a valid payload with html only', () => {
    const result = sendEmailSchema.safeParse({ to: ['a@example.com'], subject: 'hi', html: '<p>hi</p>' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email address', () => {
    const result = sendEmailSchema.safeParse({ to: ['not-an-email'], subject: 'hi', text: 'body' });
    expect(result.success).toBe(false);
  });

  it('rejects when neither text nor html is present', () => {
    const result = sendEmailSchema.safeParse({ to: ['a@example.com'], subject: 'hi' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty "to" array', () => {
    const result = sendEmailSchema.safeParse({ to: [], subject: 'hi', text: 'body' });
    expect(result.success).toBe(false);
  });
});

describe('flagSchema', () => {
  it('defaults add/remove to empty arrays', () => {
    const result = flagSchema.parse({});
    expect(result).toEqual({ add: [], remove: [] });
  });

  it('accepts explicit flags', () => {
    const result = flagSchema.parse({ add: ['\\Seen'], remove: ['\\Flagged'] });
    expect(result.add).toEqual(['\\Seen']);
    expect(result.remove).toEqual(['\\Flagged']);
  });
});

describe('moveSchema', () => {
  it('requires a non-empty targetFolder', () => {
    expect(moveSchema.safeParse({ targetFolder: '' }).success).toBe(false);
    expect(moveSchema.safeParse({ targetFolder: 'Archive' }).success).toBe(true);
  });
});

describe('createWebhookSchema', () => {
  it('rejects an invalid URL', () => {
    const result = createWebhookSchema.safeParse({ name: 'n', url: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('defaults events and status', () => {
    const result = createWebhookSchema.parse({ name: 'n', url: 'https://example.com/hook' });
    expect(result.events).toEqual(['message.received']);
    expect(result.status).toBe('active');
  });

  it('rejects an unknown event type', () => {
    const result = createWebhookSchema.safeParse({ name: 'n', url: 'https://example.com/hook', events: ['message.deleted'] });
    expect(result.success).toBe(false);
  });
});

describe('listMessagesQuerySchema', () => {
  it('coerces string query params to numbers with defaults', () => {
    const result = listMessagesQuerySchema.parse({});
    expect(result).toEqual({ limit: 20, page: 1 });
  });

  it('rejects a limit above the cap', () => {
    const result = listMessagesQuerySchema.safeParse({ limit: '500' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive page', () => {
    const result = listMessagesQuerySchema.safeParse({ page: '0' });
    expect(result.success).toBe(false);
  });
});
