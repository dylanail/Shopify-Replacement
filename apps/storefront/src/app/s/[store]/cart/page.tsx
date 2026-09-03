import type { Metadata } from "next";
import { CartPage } from "@/components/cart/CartPage";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cart", robots: { index: false } };
export default function Page() { return <CartPage />; }
