import { defineTool, type ToolDef } from "@kiln/agent";
import type { z } from "zod";
import type { AppDeps } from "../../context.js";

/** Typed wrapper so tool handlers get inferred input types with AppDeps in scope. */
export const tool = <TIn extends z.ZodType, TOut>(def: ToolDef<AppDeps, TIn, TOut>) => defineTool<AppDeps, TIn, TOut>(def);
export type AnyTool = ToolDef<AppDeps, any, any>;
