"use client";

import { useCallback, useEffect, useState } from "react";
import type { SignTypedDataParams, SignTypedDataResult } from "@make-software/csprclick-core-types";
import { useClickRef } from "@/contexts/click-context";

interface WalletState {
  connected: boolean;
  address: string;
  connecting: boolean;
  sdkReady: boolean;
  error: string | null;
  copied: boolean;
  connect: () => void;
  disconnect: () => void;
  copyAddress: () => void;
  signTypedData: (params: SignTypedDataParams) => Promise<SignTypedDataResult | undefined>;
}

export function useWallet(): WalletState {
  const { publicKey, clickRef, ready, error: sdkError, signTypedData: clickSignTypedData } = useClickRef();
  const [connecting, setConnecting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setConnecting(false);
  }, [publicKey, ready]);

  const connect = useCallback(() => {
    if (!clickRef) return;
    setConnecting(true);
    try {
      clickRef.signIn();
    } catch {
      setConnecting(false);
    }
  }, [clickRef]);

  const disconnect = useCallback(() => {
    try {
      clickRef?.signOut();
    } catch {
      // Ignore disconnect errors
    }
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
    connecting,
    sdkReady: ready,
    error: sdkError,
    copied,
    connect,
    disconnect,
    copyAddress,
    signTypedData: clickSignTypedData,
  };
}
