const { z } = require('zod');

const sendEmailSchema = z.object({
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().min(1),
  text: z.string().optional(),
  html: z.string().optional()
}).refine(b => b.text || b.html, { message: 'Either text or html is required' });

const searchCriteriaSchema = z.record(z.any());

const flagSchema = z.object({
  add: z.array(z.string()).default([]),
  remove: z.array(z.string()).default([])
});

const moveSchema = z.object({
  targetFolder: z.string().min(1)
});

const createWebhookSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  description: z.string().optional(),
  events: z.array(z.enum(['message.received'])).default(['message.received']),
  status: z.enum(['active', 'paused', 'disabled']).default('active')
});

const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(20),
  page: z.coerce.number().int().positive().default(1)
});

module.exports = {
  sendEmailSchema, searchCriteriaSchema, flagSchema, moveSchema,
  createWebhookSchema, listMessagesQuerySchema
};
