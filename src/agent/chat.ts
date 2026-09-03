import { json, now, type Db, type Row } from '../lib/db.ts'
import { id } from '../lib/ids.ts'
import { compose, plan } from './llm.ts'
import { createRun, runToCompletion } from './runtime.ts'
import type { Artifact } from './registry.ts'

export type ChatMessage = {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  page: string
  runId: string | null
  artifacts: Artifact[]
  createdAt: string
}

function rowToMessage(row: Row): ChatMessage {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    role: row.role as ChatMessage['role'],
    content: row.content as string,
    page: row.page as string,
    runId: (row.run_id as string | null) ?? null,
    artifacts: json(row.artifacts, [] as Artifact[]),
    createdAt: row.created_at as string,
  }
}

/**
 * One conversation per store, not one per page.
 *
 * The chat panel follows the merchant around the admin and the dedicated AI
 * page is the same thread; only `page` differs per message, and that is what
 * the planner reads to prefer page-relevant tools. Asking the same question in
 * two places must not produce two histories.
 */
export function sessionFor(db: Db, storeId: string): string {
  const existing = db.one<{ id: string }>('SELECT id FROM chat_sessions WHERE store_id = ? ORDER BY updated_at DESC LIMIT 1', storeId)
  if (existing) return existing.id
  const sessionId = id('chat')
  db.insert('chat_sessions', { id: sessionId, store_id: storeId, title: '', created_at: now(), updated_at: now() })
  return sessionId
}

export function history(db: Db, storeId: string, limit = 50, before?: string): ChatMessage[] {
  const sessionId = sessionFor(db, storeId)
  const rows = before
    ? db.all('SELECT * FROM chat_messages WHERE session_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?', sessionId, before, limit)
    : db.all('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?', sessionId, limit)
  return rows.map(rowToMessage).reverse()
}

function append(db: Db, storeId: string, sessionId: string, message: Omit<ChatMessage, 'id' | 'sessionId' | 'createdAt'>): ChatMessage {
  const messageId = id('msg')
  db.insert('chat_messages', {
    id: messageId,
    session_id: sessionId,
    store_id: storeId,
    role: message.role,
    content: message.content,
    page: message.page,
    run_id: message.runId,
    artifacts: message.artifacts,
    created_at: now(),
  })
  db.run('UPDATE chat_sessions SET updated_at = ? WHERE id = ?', now(), sessionId)
  return rowToMessage(db.one('SELECT * FROM chat_messages WHERE id = ?', messageId) as Row)
}

export type AskResult = { user: ChatMessage; assistant: ChatMessage; runId: string; failures: string[] }

/**
 * A turn: plan, persist the run, execute it, write the reply.
 *
 * The run row is written before the first tool fires, so a crash mid-turn
 * leaves a resumable record rather than a half-changed store with no trace of
 * who changed it.
 */
export async function ask(
  db: Db,
  input: { storeId: string; userId: string; text: string; page?: string },
): Promise<AskResult> {
  const sessionId = sessionFor(db, input.storeId)
  const user = append(db, input.storeId, sessionId, {
    role: 'user',
    content: input.text,
    page: input.page ?? '',
    runId: null,
    artifacts: [],
  })

  const prior = history(db, input.storeId, 12).filter((message) => message.id !== user.id && (message.role === 'user' || message.role === 'assistant'))
  const planned = await plan(input.text, { db, storeId: input.storeId, ...(input.page ? { page: input.page } : {}), history: prior.map((message) => ({ role: message.role as 'user' | 'assistant', content: message.content })) })
  const run = createRun(db, {
    storeId: input.storeId,
    kind: 'chat',
    prompt: input.text,
    ...(input.page ? { page: input.page } : {}),
    sessionId,
    steps: planned.steps,
  })
  const outcome = await runToCompletion(db, run.id, {
    actor: { type: 'agent', id: input.userId },
    ...(input.page ? { page: input.page } : {}),
  })

  const assistant = append(db, input.storeId, sessionId, {
    role: 'assistant',
    content: compose(planned.preamble, outcome.results.map((result) => result.summary), outcome.failures),
    page: input.page ?? '',
    runId: run.id,
    artifacts: outcome.artifacts.slice(0, 6),
  })

  return { user, assistant, runId: run.id, failures: outcome.failures }
}

/** The empty-state suggestions and the prompt library behind the chat input. */
export const SUGGESTIONS = [
  { icon: 'plus', label: 'Add a new product', prompt: 'Add a product called "The Field Jacket" for $240 with sizes' },
  { icon: 'layout', label: 'Update the homepage', prompt: 'Update the homepage hero with the flagship product on a plain ground' },
  { icon: 'tag', label: 'Create a discount', prompt: 'Create a 15% discount on code SPRING15' },
  { icon: 'chart', label: 'Review analytics', prompt: 'How is the store doing this week?' },
]

export const PROMPT_LIBRARY = [
  'Add a product called "The Weekender" for $180 with sizes',
  'Write a better description for the flagship product',
  'Create a 10% welcome discount for first orders',
  'Set free shipping over $150',
  'Group the catalog into collections',
  'Show me the pending review queue',
  'What is my conversion rate this week?',
  'Which variants are running low on stock?',
  'Refund order 1002',
  'Mark order 1003 fulfilled',
  'Connect the domain ironjaw.co',
  'Install Shippo for labels',
  'Install the Meta pixel',
  'Check what a crawler sees on my product pages',
  'Write a journal post about how the gloves are made',
  'Draft a campaign about the new colourway',
  'Make the storefront darker and roomier',
  'Publish the store',
  'Who are my repeat customers?',
  'Ask recent buyers for a review',
]
