"use client";

import dynamic from "next/dynamic";

const WalletProvider = dynamic(
  () => import("@/components/wallet-provider"),
  { ssr: false }
);

export function Providers({ children }: { children: React.ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}
