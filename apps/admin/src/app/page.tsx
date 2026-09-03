"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { tokens } from "@/lib/api";

export default function Index() {
  const router = useRouter();
  useEffect(() => {
    router.replace(tokens.access() ? "/dashboard" : "/login");
  }, [router]);
  return null;
}
