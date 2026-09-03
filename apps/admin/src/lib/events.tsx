"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AgentEvent } from "@kiln/shared";
import { API_BASE, tokens } from "./api";
import { useStore } from "./store-context";

export type Channel = "agent" | "activity" | "build" | "analytics" | "domain";
export interface ActivityEvent { area: string; status: "running" | "done" | "error" | string; message: string; runId?: string }
export interface BuildEvent { environment: "draft" | "live"; status: string; message: string }
export interface AnalyticsEvent { kind: string; path?: string; valueCents?: number; country?: string; city?: string; at: string }
export interface DomainEvent { kind: string; hostname: string }
type Handler = (data: unknown) => void;

interface EventsCtx {
  subscribe: (channel: Channel, handler: Handler) => () => void;
  connected: boolean;
  dots: Record<string, { status: string; at: number }>;
}
const Ctx = createContext<EventsCtx | null>(null);

/** One EventSource per store, shared by the whole admin. */
export function EventsProvider({ children }: { children: ReactNode }) {
  const { storeId } = useStore();
  const qc = useQueryClient();
  const handlers = useRef<Record<Channel, Set<Handler>>>({ agent: new Set(), activity: new Set(), build: new Set(), analytics: new Set(), domain: new Set() });
  const [connected, setConnected] = useState(false);
  const [dots, setDots] = useState<Record<string, { status: string; at: number }>>({});

  useEffect(() => {
    if (!storeId) return;
    let es: EventSource | null = null;
    let closed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const open = () => {
      const token = tokens.access();
      if (!token || closed) return;
      es = new EventSource(`${API_BASE}/stores/${storeId}/events?token=${encodeURIComponent(token)}`);
      es.onopen = () => {
        retry = 0;
        setConnected(true);
      };
      es.onerror = () => {
        setConnected(false);
        es?.close();
        if (closed) return;
        retry++;
        timer = setTimeout(open, Math.min(15_000, 1000 * 2 ** retry));
      };
      for (const ch of ["agent", "activity", "build", "analytics", "domain"] as Channel[]) {
        es.addEventListener(ch, (ev) => {
          let data: unknown = (ev as MessageEvent).data;
          try {
            data = JSON.parse(String(data));
          } catch {
            /* keep raw */
          }
          for (const h of handlers.current[ch]) h(data);
        });
      }
    };
    open();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, [storeId]);

  // Activity dots on the rail + query invalidation when the agent touches an area.
  useEffect(() => {
    const onActivity = (raw: unknown) => {
      const e = raw as ActivityEvent;
      if (!e?.area) return;
      setDots((d) => ({ ...d, [e.area]: { status: e.status, at: Date.now() } }));
      if (e.status !== "running") void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "s" || q.queryKey[0] === "store" });
    };
    const onAgent = (raw: unknown) => {
      const e = raw as AgentEvent;
      if (e.type === "tool.started" && e.area) setDots((d) => ({ ...d, [e.area!]: { status: "running", at: Date.now() } }));
      if (e.type === "tool.finished" && e.area) {
        setDots((d) => ({ ...d, [e.area!]: { status: e.ok ? "done" : "error", at: Date.now() } }));
        void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "s" || q.queryKey[0] === "store" });
      }
    };
    handlers.current.activity.add(onActivity);
    handlers.current.agent.add(onAgent);
    const h = handlers.current;
    return () => {
      h.activity.delete(onActivity);
      h.agent.delete(onAgent);
    };
  }, [qc]);

  // Fade dots after ~8s.
  useEffect(() => {
    const t = setInterval(() => {
      setDots((d) => {
        const now = Date.now();
        const next: typeof d = {};
        let changed = false;
        for (const [k, v] of Object.entries(d)) {
          if (now - v.at < 8000) next[k] = v;
          else changed = true;
        }
        return changed ? next : d;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const subscribe = useCallback((channel: Channel, handler: Handler) => {
    handlers.current[channel].add(handler);
    return () => {
      handlers.current[channel].delete(handler);
    };
  }, []);

  const value = useMemo(() => ({ subscribe, connected, dots }), [subscribe, connected, dots]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEvents() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useEvents must be used inside EventsProvider");
  return v;
}

export function useEventChannel<T = unknown>(channel: Channel, handler: (data: T) => void) {
  const { subscribe } = useEvents();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribe(channel, (d) => ref.current(d as T)), [channel, subscribe]);
}

export const useAgentEvents = (handler: (e: AgentEvent) => void) => useEventChannel<AgentEvent>("agent", handler);
export const useActivityDots = () => useEvents().dots;
