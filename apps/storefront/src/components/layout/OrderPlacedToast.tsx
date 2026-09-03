"use client";
import { useSearchParams } from "next/navigation";
import { Toast } from "@/components/ui/Toast";
export function OrderPlacedToast() {
  const sp = useSearchParams();
  if (sp.get("placed") !== "1") return null;
  return <Toast message="Order confirmed — thank you!" />;
}
