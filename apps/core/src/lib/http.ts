import type { Context } from "hono";
import { z } from "zod";
import { badRequest } from "./errors.js";

export async function parseBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    raw = {};
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw badRequest("Validation failed", r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  return r.data;
}

export function parseQuery<T extends z.ZodType>(c: Context, schema: T): z.infer<T> {
  const r = schema.safeParse(c.req.query());
  if (!r.success) throw badRequest("Invalid query", r.error.issues);
  return r.data;
}

export const Pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  q: z.string().optional(),
  status: z.string().optional(),
  sort: z.string().optional(),
});
export type PaginationQ = z.infer<typeof Pagination>;
export const offsetOf = (p: PaginationQ) => (p.page - 1) * p.pageSize;

export function sse(c: Context, subscribe: (send: (event: string, data: unknown) => void) => () => void) {
  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* closed */
        }
      };
      send("ready", { at: new Date().toISOString() });
      const ping = setInterval(() => send("ping", {}), 15000);
      unsubscribe = subscribe(send);
      const prev = unsubscribe;
      unsubscribe = () => {
        clearInterval(ping);
        prev();
      };
    },
    cancel() {
      unsubscribe();
    },
  });
  c.req.raw.signal.addEventListener("abort", () => unsubscribe());
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}

export const dayRange = (range: string) => ({ "24h": 1, "7d": 7, "30d": 30, "90d": 90 })[range] ?? 7;
