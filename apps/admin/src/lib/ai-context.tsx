"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AgentEvent } from "@kiln/shared";
import { api, errorMessage } from "./api";
import { useStore } from "./store-context";
import { useAgentEvents } from "./events";
import { areaFromPath } from "./utils";
import type { AgentRun, AiModel, ChatMessageRow, ChatSession, PromptItem } from "./types";

export interface ToolCall { callId: string; name: string; area?: string; input: unknown; output?: unknown; ok?: boolean; status: "running" | "done" | "error" }
export interface ChatMsg { id: string; role: "user" | "assistant"; text: string; images?: string[]; tools: ToolCall[]; runId?: string; status?: "streaming" | "done" | "failed" | "cancelled" | "paused"; error?: string; createdAt: string }
export interface ActiveRun { runId: string; status: "queued" | "running" | "paused"; question?: string; confirm?: boolean }
export type PanelState = "collapsed" | "open" | "wide";
export type SheetState = "closed" | "half" | "full";

export const FALLBACK_PROMPTS: PromptItem[] = [
  { area: "products", title: "Add a new product", prompt: "Add a new product to my catalog" },
  { area: "designer", title: "Update homepage", prompt: "Update the homepage hero headline to something more specific to what we make" },
  { area: "promotions", title: "Create a discount", prompt: "Create discount code WELCOME10 for 10% off first orders" },
  { area: "analytics", title: "Review analytics", prompt: "Review analytics for the last 7 days and tell me what to fix" },
];

interface AiCtx {
  messages: ChatMsg[];
  activeRun: ActiveRun | null;
  plan: { title: string; status: string }[];
  queue: { text: string; images?: string[] }[];
  sessionId: string | null;
  sessions: ChatSession[];
  loadingSession: boolean;
  model: string;
  setModel: (m: string) => void;
  models: AiModel[];
  credits: { balance: number; usedThisPeriod: number } | null;
  prompts: PromptItem[];
  suggestionsFor: (area: string) => PromptItem[];
  pageContext: string;
  send: (text: string, images?: string[], opts?: { pageContext?: string }) => Promise<void>;
  resume: (answer: string, confirm: boolean) => Promise<void>;
  cancel: () => Promise<void>;
  clearQueue: () => void;
  loadSession: (id: string) => Promise<void>;
  newSession: () => void;
  panel: PanelState;
  setPanel: (p: PanelState) => void;
  sheet: SheetState;
  setSheet: (s: SheetState) => void;
  /** Open the assistant (desktop panel or mobile sheet), optionally sending a prompt. */
  open: (prompt?: string) => void;
  historyOpen: boolean;
  setHistoryOpen: (v: boolean) => void;
}

const Ctx = createContext<AiCtx | null>(null);
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const CONFIRM_RE = /^i'm about to run /i;

function rowsToMessages(rows: ChatMessageRow[]): ChatMsg[] {
  const out: ChatMsg[] = [];
  for (const r of rows) {
    if (r.role === "user") out.push({ id: r.id, role: "user", text: r.content.text ?? "", images: r.content.images, tools: [], runId: r.runId ?? undefined, status: "done", createdAt: r.createdAt });
    else if (r.role === "assistant") {
      const tools: ToolCall[] = (r.content.toolCalls ?? []).map((t) => ({ callId: t.id, name: t.name, input: t.input, status: "done" }));
      const last = out[out.length - 1];
      // Consecutive assistant turns within one run collapse into a single bubble.
      if (last && last.role === "assistant" && last.runId && last.runId === r.runId) {
        last.text = [last.text, r.content.text ?? ""].filter(Boolean).join("\n\n");
        last.tools.push(...tools);
      } else out.push({ id: r.id, role: "assistant", text: r.content.text ?? "", tools, runId: r.runId ?? undefined, status: "done", createdAt: r.createdAt });
    } else if (r.role === "tool") {
      const last = [...out].reverse().find((m) => m.role === "assistant");
      for (const res of r.content.results ?? []) {
        const t = last?.tools.find((x) => x.callId === res.id);
        if (t) { t.output = res.output; t.ok = res.ok; t.status = res.ok ? "done" : "error"; }
      }
    }
  }
  return out;
}

export function AiProvider({ children }: { children: ReactNode }) {
  const { storeId, store } = useStore();
  const pathname = usePathname();
  const qc = useQueryClient();
  const pageContext = areaFromPath(pathname);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);
  const [plan, setPlan] = useState<{ title: string; status: string }[]>([]);
  const [queue, setQueue] = useState<{ text: string; images?: string[] }[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [model, setModelState] = useState<string>("");
  const [panel, setPanelState] = useState<PanelState>("open");
  const [sheet, setSheet] = useState<SheetState>("closed");
  const [historyOpen, setHistoryOpen] = useState(false);

  const known = useRef<Set<string>>(new Set());
  const buffered = useRef<Map<string, AgentEvent[]>>(new Map());
  const activeRef = useRef<ActiveRun | null>(null);
  activeRef.current = activeRun;
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const sessionRef = useRef(sessionId);
  sessionRef.current = sessionId;

  // Persisted panel state + last session per store.
  useEffect(() => {
    try {
      const p = localStorage.getItem("kiln.panel") as PanelState | null;
      if (p === "collapsed" || p === "open" || p === "wide") setPanelState(p);
      const m = localStorage.getItem("kiln.model");
      if (m) setModelState(m);
    } catch { /* ignore */ }
  }, []);
  const setPanel = useCallback((p: PanelState) => {
    setPanelState(p);
    try { localStorage.setItem("kiln.panel", p); } catch { /* ignore */ }
  }, []);
  const setModel = useCallback((m: string) => {
    setModelState(m);
    try { localStorage.setItem("kiln.model", m); } catch { /* ignore */ }
  }, []);

  const modelsQ = useQuery({ queryKey: ["s", storeId, "ai-models"], queryFn: () => api<{ items: AiModel[]; credits: { balance: number; usedThisPeriod: number } }>(`/stores/${storeId}/ai/models`), staleTime: 60_000 });
  const promptsQ = useQuery({ queryKey: ["s", storeId, "ai-prompts"], queryFn: () => api<{ items: PromptItem[] }>(`/stores/${storeId}/ai/prompts`), staleTime: 300_000 });
  const sessionsQ = useQuery({ queryKey: ["s", storeId, "ai-sessions"], queryFn: () => api<{ items: ChatSession[] }>(`/stores/${storeId}/ai/sessions`), staleTime: 15_000 });

  const applyToRun = useCallback((runId: string, fn: (m: ChatMsg) => ChatMsg) => {
    setMessages((ms) => ms.map((m) => (m.role === "assistant" && m.runId === runId ? fn(m) : m)));
  }, []);

  const sendNow = useCallback(async (text: string, images: string[] | undefined, ctx: string, resumeOf?: { runId: string; confirm: boolean }) => {
    const userMsg: ChatMsg = { id: uid(), role: "user", text, images, tools: [], status: "done", createdAt: new Date().toISOString() };
    const placeholderId = uid();
    setMessages((ms) => [...ms, userMsg, { id: placeholderId, role: "assistant", text: "", tools: [], status: "streaming", createdAt: new Date().toISOString() }]);
    setActiveRun({ runId: "pending", status: "queued" });
    try {
      const r = resumeOf
        ? await api<{ runId: string; sessionId: string; model: string }>(`/stores/${storeId}/ai/runs/${resumeOf.runId}/resume`, { method: "POST", body: { answer: text, confirm: resumeOf.confirm } })
        : await api<{ runId: string; sessionId: string; model: string }>(`/stores/${storeId}/ai/runs`, { method: "POST", body: { input: text, images: images?.length ? images : undefined, sessionId: sessionRef.current ?? undefined, pageContext: ctx, model: model || undefined } });
      known.current.add(r.runId);
      setSessionId(r.sessionId);
      sessionRef.current = r.sessionId;
      try { sessionStorage.setItem(`kiln.session.${storeId}`, r.sessionId); } catch { /* ignore */ }
      setMessages((ms) => ms.map((m) => (m.id === placeholderId ? { ...m, runId: r.runId } : m)));
      setActiveRun((a) => (a?.status === "paused" ? a : { runId: r.runId, status: "running" }));
      // Replay anything that arrived before we knew the run id.
      const early = buffered.current.get(r.runId);
      if (early) {
        buffered.current.delete(r.runId);
        for (const e of early) handleRef.current(e);
      }
      void qc.invalidateQueries({ queryKey: ["s", storeId, "ai-sessions"] });
    } catch (e) {
      const msg = errorMessage(e);
      setMessages((ms) => ms.map((m) => (m.id === placeholderId ? { ...m, status: "failed", error: msg } : m)));
      setActiveRun(null);
    }
  }, [storeId, model, qc]);

  const send = useCallback(async (text: string, images?: string[], opts?: { pageContext?: string }) => {
    const t = text.trim();
    if (!t && !images?.length) return;
    const a = activeRef.current;
    if (a?.status === "paused") {
      const confirm = !!a.confirm && /^(y(es|ep|eah)?|ok(ay)?|sure|go( ahead)?|confirm(ed)?|do it|proceed|approved?)\b/i.test(t);
      setActiveRun(null);
      await sendNow(t, images, opts?.pageContext ?? pageContext, { runId: a.runId, confirm });
      return;
    }
    if (a) {
      setQueue((q) => [...q, { text: t, images }]);
      return;
    }
    await sendNow(t, images, opts?.pageContext ?? pageContext);
  }, [sendNow, pageContext]);

  const resume = useCallback(async (answer: string, confirm: boolean) => {
    const a = activeRef.current;
    if (!a) return;
    setActiveRun(null);
    await sendNow(answer, undefined, pageContext, { runId: a.runId, confirm });
  }, [sendNow, pageContext]);

  const cancel = useCallback(async () => {
    const a = activeRef.current;
    if (!a || a.runId === "pending") return;
    try {
      await api(`/stores/${storeId}/ai/runs/${a.runId}/cancel`, { method: "POST" });
    } catch { /* the finished event will not arrive; clean up locally */
      applyToRun(a.runId, (m) => ({ ...m, status: "cancelled" }));
      setActiveRun(null);
    }
  }, [storeId, applyToRun]);

  const handle = useCallback((e: AgentEvent) => {
    if (!known.current.has(e.runId)) {
      // Not ours (yet) — keep briefly in case the POST response is still in flight.
      const cur = activeRef.current;
      if (cur?.runId === "pending") {
        const list = buffered.current.get(e.runId) ?? [];
        list.push(e);
        buffered.current.set(e.runId, list.slice(-200));
      }
      return;
    }
    switch (e.type) {
      case "run.started":
        setActiveRun((a) => (a && a.runId === e.runId ? { ...a, status: "running" } : a));
        break;
      case "text":
        applyToRun(e.runId, (m) => ({ ...m, text: m.text + e.delta }));
        break;
      case "tool.started":
        applyToRun(e.runId, (m) => ({ ...m, tools: [...m.tools.filter((t) => t.callId !== e.callId), { callId: e.callId, name: e.tool, area: e.area, input: e.input, status: "running" }] }));
        break;
      case "tool.finished":
        applyToRun(e.runId, (m) => ({ ...m, tools: m.tools.some((t) => t.callId === e.callId) ? m.tools.map((t) => (t.callId === e.callId ? { ...t, output: e.output, ok: e.ok, status: e.ok ? "done" : "error" } : t)) : [...m.tools, { callId: e.callId, name: e.tool, area: e.area, input: undefined, output: e.output, ok: e.ok, status: e.ok ? "done" : "error" }] }));
        break;
      case "todo.updated":
        setPlan(e.todos);
        break;
      case "question":
        setActiveRun({ runId: e.runId, status: "paused", question: e.question, confirm: CONFIRM_RE.test(e.question) });
        applyToRun(e.runId, (m) => ({ ...m, status: "paused" }));
        break;
      case "run.finished": {
        applyToRun(e.runId, (m) => ({ ...m, status: e.status === "paused" ? "paused" : e.status === "completed" ? "done" : e.status, text: m.text || e.summary || (e.status === "failed" ? "" : m.text), error: e.error }));
        if (e.status === "paused") {
          setActiveRun((a) => (a?.status === "paused" ? a : { runId: e.runId, status: "paused", question: a?.question ?? "The assistant needs your input to continue." }));
        } else {
          setActiveRun(null);
          if (e.status === "completed") setPlan((p) => p.map((t) => ({ ...t, status: "done" })));
          void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "s" || q.queryKey[0] === "store" });
          const next = queueRef.current[0];
          if (next) {
            setQueue((q) => q.slice(1));
            setTimeout(() => void sendNow(next.text, next.images, pageContext), 250);
          }
        }
        break;
      }
    }
  }, [applyToRun, qc, sendNow, pageContext]);
  const handleRef = useRef(handle);
  handleRef.current = handle;
  useAgentEvents((e) => handleRef.current(e));

  // Restore the last session for this store after a full reload.
  const loadSession = useCallback(async (id: string) => {
    setLoadingSession(true);
    setHistoryOpen(false);
    try {
      const r = await api<{ items: ChatMessageRow[] }>(`/stores/${storeId}/ai/sessions/${id}/messages`);
      const msgs = rowsToMessages(r.items);
      setMessages(msgs);
      setSessionId(id);
      sessionRef.current = id;
      setPlan([]);
      try { sessionStorage.setItem(`kiln.session.${storeId}`, id); } catch { /* ignore */ }
      // If the latest run is still going, re-attach to it.
      const lastRun = [...msgs].reverse().find((m) => m.runId)?.runId;
      if (lastRun) {
        try {
          const run = await api<AgentRun>(`/stores/${storeId}/ai/runs/${lastRun}`);
          if (run.status === "running" || run.status === "queued") {
            known.current.add(lastRun);
            setActiveRun({ runId: lastRun, status: "running" });
            applyToRun(lastRun, (m) => ({ ...m, status: "streaming" }));
            setPlan(run.todos ?? []);
          } else if (run.status === "paused") {
            known.current.add(lastRun);
            const q = (run.steps as { kind?: string; detail?: { question?: string } }[]).map((s) => s.detail?.question).filter(Boolean).pop();
            setActiveRun({ runId: lastRun, status: "paused", question: q ?? "The assistant is waiting for your answer.", confirm: !!q && CONFIRM_RE.test(q) });
          } else if (run.status === "failed") applyToRun(lastRun, (m) => ({ ...m, status: "failed", error: run.error ?? undefined }));
        } catch { /* ignore */ }
      }
    } finally {
      setLoadingSession(false);
    }
  }, [storeId, applyToRun]);

  useEffect(() => {
    setMessages([]);
    setActiveRun(null);
    setPlan([]);
    setQueue([]);
    setSessionId(null);
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(`kiln.session.${storeId}`); } catch { /* ignore */ }
    if (saved) void loadSession(saved);
  }, [storeId, loadSession]);

  const newSession = useCallback(() => {
    setMessages([]);
    setActiveRun(null);
    setPlan([]);
    setQueue([]);
    setSessionId(null);
    sessionRef.current = null;
    setHistoryOpen(false);
    try { sessionStorage.removeItem(`kiln.session.${storeId}`); } catch { /* ignore */ }
  }, [storeId]);

  const prompts = promptsQ.data?.items ?? [];
  const suggestionsFor = useCallback((area: string) => {
    const mine = prompts.filter((p) => p.area === area);
    const rest = prompts.filter((p) => p.area !== area);
    const list = [...mine, ...rest].slice(0, 4);
    return list.length >= 4 ? list : [...list, ...FALLBACK_PROMPTS.filter((f) => !list.some((l) => l.title === f.title))].slice(0, 4);
  }, [prompts]);

  const open = useCallback((prompt?: string) => {
    const mobile = typeof window !== "undefined" && window.innerWidth < 768;
    if (mobile) setSheet("half");
    else if (panel === "collapsed") setPanel("open");
    if (prompt) void send(prompt);
  }, [panel, setPanel, send]);

  const value = useMemo<AiCtx>(() => ({
    messages, activeRun, plan, queue, sessionId, sessions: sessionsQ.data?.items ?? [], loadingSession,
    model: model || store?.aiModel || "", setModel, models: modelsQ.data?.items ?? [], credits: modelsQ.data?.credits ?? null,
    prompts, suggestionsFor, pageContext, send, resume, cancel, clearQueue: () => setQueue([]), loadSession, newSession,
    panel, setPanel, sheet, setSheet, open, historyOpen, setHistoryOpen,
  }), [messages, activeRun, plan, queue, sessionId, sessionsQ.data, loadingSession, model, store?.aiModel, setModel, modelsQ.data, prompts, suggestionsFor, pageContext, send, resume, cancel, loadSession, newSession, panel, setPanel, sheet, open, historyOpen]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAi() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAi must be used inside AiProvider");
  return v;
}
