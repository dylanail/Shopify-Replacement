import { EventEmitter } from 'node:events'
import type { ToolArea } from './registry.ts'

export type ActivityEvent = {
  storeId: string
  runId: string
  at: string
  kind: 'run.started' | 'run.finished' | 'run.failed' | 'step.started' | 'step.done' | 'step.failed' | 'message'
  area?: ToolArea
  tool?: string
  summary?: string
  /** The rail dot colour the admin should show for this area. */
  status?: 'running' | 'done' | 'failed'
}

/**
 * One in-process bus. The admin's activity dots, the chat panel and the
 * onboarding progress screen are all the same stream read three ways — there
 * is no second notification path to keep in sync.
 *
 * A multi-node deployment replaces this with Redis pub/sub behind the same
 * two functions; nothing above this line changes.
 */
const bus = new EventEmitter()
bus.setMaxListeners(200)

const recent = new Map<string, ActivityEvent[]>()

export function emitActivity(event: ActivityEvent) {
  const list = recent.get(event.storeId) ?? []
  list.push(event)
  recent.set(event.storeId, list.slice(-100))
  bus.emit(event.storeId, event)
}

export function onActivity(storeId: string, listener: (event: ActivityEvent) => void): () => void {
  bus.on(storeId, listener)
  return () => bus.off(storeId, listener)
}

export function recentActivity(storeId: string, limit = 30): ActivityEvent[] {
  return (recent.get(storeId) ?? []).slice(-limit)
}
