import type { AgentEvent } from "@kiln/shared";

export type BusEvent =
  | { channel: "agent"; storeId: string; event: AgentEvent }
  | { channel: "activity"; storeId: string; event: { area: string; status: string; message: string; runId?: string } }
  | { channel: "analytics"; storeId: string; event: { kind: string; path?: string; valueCents?: number; country?: string; city?: string; at: string } }
  | { channel: "build"; storeId: string; event: { environment: string; status: string; message: string } }
  | { channel: "domain"; storeId: string; event: { kind: string; [k: string]: unknown } };

type Listener = (e: BusEvent) => void;

/** In-process pub/sub used for SSE streams. Swap for Redis pub/sub when running multiple core nodes. */
export class EventBus {
  private listeners = new Set<Listener>();
  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  publish(e: BusEvent) {
    for (const l of this.listeners) {
      try {
        l(e);
      } catch {
        /* listener errors never break publishers */
      }
    }
  }
}
