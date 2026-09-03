import { proxySeoFile } from "@/lib/seo-proxy";
export const dynamic = "force-dynamic";
export async function GET() { return proxySeoFile("llms.txt"); }
