"use client";

import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage, type ApiOptions } from "./api";
import { useStore } from "./store-context";
import { useToast } from "@/components/ui";

/** Store-scoped fetcher: sapi("/products") → GET /stores/<id>/products */
export function useStoreApi() {
  const { storeId } = useStore();
  return useCallback(<T = unknown,>(path: string, opts?: ApiOptions) => api<T>(`/stores/${storeId}${path}`, opts), [storeId]);
}

/** Invalidate every store-scoped query (and the store itself). */
export function useInvalidateStore() {
  const qc = useQueryClient();
  const { storeId } = useStore();
  return useCallback(
    (prefix?: string) => {
      void qc.invalidateQueries({ predicate: (q) => (q.queryKey[0] === "s" && q.queryKey[1] === storeId && (!prefix || q.queryKey[2] === prefix)) || (q.queryKey[0] === "store" && q.queryKey[1] === storeId) });
    },
    [qc, storeId],
  );
}

interface MutOpts<TVars, TOut> {
  success?: string | ((out: TOut, vars: TVars) => string);
  onSuccess?: (out: TOut, vars: TVars) => void;
  onError?: (e: unknown, vars: TVars) => void;
  /** Query-key prefix to invalidate (defaults to everything store-scoped). */
  invalidate?: string | false;
}

/** Mutation wrapper: toast on success/error, invalidate store queries. */
export function useStoreMutation<TVars = void, TOut = unknown>(fn: (sapi: <T = unknown>(path: string, opts?: ApiOptions) => Promise<T>, vars: TVars) => Promise<TOut>, opts: MutOpts<TVars, TOut> = {}) {
  const sapi = useStoreApi();
  const toast = useToast();
  const invalidate = useInvalidateStore();
  return useMutation({
    mutationFn: (vars: TVars) => fn(sapi, vars),
    onSuccess: (out, vars) => {
      if (opts.invalidate !== false) invalidate(opts.invalidate || undefined);
      if (opts.success) toast(typeof opts.success === "function" ? opts.success(out, vars) : opts.success);
      opts.onSuccess?.(out, vars);
    },
    onError: (e, vars) => {
      toast(errorMessage(e), "error");
      opts.onError?.(e, vars);
    },
  });
}
