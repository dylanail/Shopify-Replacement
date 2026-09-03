import { now, type Db } from '../lib/db.ts'
import { id } from '../lib/ids.ts'
import { logger } from '../lib/log.ts'
import { format } from '../lib/money.ts'
import { getStore } from '../control/stores.ts'
import type { Order } from '../domain/types.ts'
import { layout, lineTotals, render, templateFor, type TemplateKey } from './templates.ts'

const log = logger('email')
const MAX_ATTEMPTS = 3

export type SendResult = { id: string; status: 'sent' | 'failed' | 'queued'; subject: string }

/**
 * Delivery goes through Resend when a key is configured and through the log
 * otherwise, but the send record is written either way. A store that has not
 * connected a sending domain yet still gets a complete, auditable outbox —
 * "did the customer get the receipt?" must be answerable on day one.
 */
export async function sendEmail(
  db: Db,
  storeId: string,
  input: { template: TemplateKey; to: string; context: Record<string, unknown> },
): Promise<SendResult> {
  const store = getStore(db, storeId)
  if (!store) throw new Error('No store')
  const template = templateFor(input.template)
  const context = { store: { name: store.name, ...store.brand }, ...input.context }
  const subject = render(template.subject, context)
  const html = layout(store.brand, render(template.body, { heading: subject, ...context }), store.name)

  const sendId = id('em')
  db.insert('email_sends', {
    id: sendId,
    store_id: storeId,
    template: input.template,
    recipient: input.to,
    subject,
    html,
    status: 'queued',
    attempts: 0,
    error: '',
    created_at: now(),
  })

  const apiKey = process.env.RESEND_API_KEY
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      if (!apiKey) {
        log.info(`(no RESEND_API_KEY) would send "${subject}" to ${input.to}`)
        db.update('email_sends', sendId, { status: 'sent', attempts: attempt })
        return { id: sendId, status: 'sent', subject }
      }
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `${store.name} <orders@${process.env.AMBORAS_EMAIL_DOMAIN ?? 'amboras.app'}>`, to: input.to, subject, html }),
      })
      if (!response.ok) throw new Error(`Resend replied ${response.status}`)
      db.update('email_sends', sendId, { status: 'sent', attempts: attempt })
      return { id: sendId, status: 'sent', subject }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      db.update('email_sends', sendId, { status: attempt === MAX_ATTEMPTS ? 'failed' : 'queued', attempts: attempt, error: message })
      if (attempt === MAX_ATTEMPTS) {
        log.warn(`gave up on ${input.template} to ${input.to}: ${message}`)
        return { id: sendId, status: 'failed', subject }
      }
      await new Promise((resolve) => setTimeout(resolve, 200 * attempt))
    }
  }
  return { id: sendId, status: 'failed', subject }
}

export function orderContext(order: Order, storeUrl: string) {
  return {
    order: {
      displayId: order.displayId,
      items: lineTotals(order.items, order.currency),
      subtotal: format(order.subtotalCents, order.currency),
      discount: order.discountCents ? format(order.discountCents, order.currency) : '',
      discountCode: order.discountCode,
      shipping: order.shippingCents ? format(order.shippingCents, order.currency) : 'Free',
      total: format(order.totalCents, order.currency),
    },
    customer: { firstName: (order.address.name ?? order.email).split(/[\s@]/)[0] },
    orderUrl: `${storeUrl}/orders/${order.id}`,
    storeUrl,
  }
}

export function listSends(db: Db, storeId: string, limit = 50) {
  return db.all(
    'SELECT id, template, recipient, subject, status, attempts, error, created_at FROM email_sends WHERE store_id = ? ORDER BY created_at DESC LIMIT ?',
    storeId,
    limit,
  )
}

export function getSend(db: Db, storeId: string, sendId: string) {
  return db.one('SELECT * FROM email_sends WHERE store_id = ? AND id = ?', storeId, sendId)
}
