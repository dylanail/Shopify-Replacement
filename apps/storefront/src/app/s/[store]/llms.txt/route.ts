import { proxySeoFile } from "@/lib/seo-proxy";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: Promise<{ store: string }> }) { return proxySeoFile("llms.txt", decodeURIComponent((await params).store)); }
