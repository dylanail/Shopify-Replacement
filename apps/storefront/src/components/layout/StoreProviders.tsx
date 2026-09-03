"use client";
import type { ReactNode } from "react";
import type { StoreClient } from "@/lib/lite";
import { StoreProvider } from "@/components/providers/StoreProvider";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { CartProvider } from "@/components/providers/CartProvider";
import { AccountProvider } from "@/components/providers/AccountProvider";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { Slot } from "@/components/slots/Slot";

/** Client provider stack for a store: store ctx → analytics session → cart → account, plus root/bodyEnd slots and the cart drawer. */
export function StoreProviders({ value, children }: { value: StoreClient; children: ReactNode }) {
  return (
    <StoreProvider value={value}>
      <SessionProvider>
        <CartProvider>
          <AccountProvider>
            <Slot name="rootProviders" ctx={{ page: "root" }} wrap={false} />
            {children}
            <CartDrawer />
            <Slot name="bodyEnd" ctx={{ page: "root" }} wrap={false} />
          </AccountProvider>
        </CartProvider>
      </SessionProvider>
    </StoreProvider>
  );
}
