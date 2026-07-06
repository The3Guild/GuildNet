"use client";

import { useCallback, useState } from "react";
import type { SignTypedDataParams, SignTypedDataResult } from "@make-software/csprclick-core-types";
import { useClickRef } from "@/contexts/click-context";
import { shortenAddress } from "@/lib/utils";

interface WalletState {
  connected: boolean;
  address: string;
  connecting: boolean;
  copied: boolean;
  connect: () => void;
  disconnect: () => void;
  copyAddress: () => void;
  signTypedData: (params: SignTypedDataParams) => Promise<SignTypedDataResult | undefined>;
}

export function useWallet(): WalletState {
  const { publicKey, clickRef, signTypedData: clickSignTypedData } = useClickRef();
  const [copied, setCopied] = useState(false);

  const connect = useCallback(() => {
    clickRef?.signIn();
  }, [clickRef]);

  const disconnect = useCallback(() => {
    clickRef?.signOut();
  }, [clickRef]);

  const copyAddress = useCallback(() => {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [publicKey]);

  return {
    connected: !!publicKey,
    address: publicKey ?? "",
    connecting: false,
    copied,
    connect,
    disconnect,
    copyAddress,
    signTypedData: clickSignTypedData,
  };
}
