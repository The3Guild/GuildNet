"use client";

import { useState, useCallback, useEffect } from "react";
import { shortenAddress } from "@/lib/utils";

const CSPR_CLICK_URL = "https://wallet.cspr.click/";
const STORAGE_KEY = "guildnet:casper-address";

interface WalletState {
  connected: boolean;
  address: string;
  connecting: boolean;
  copied: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  copyAddress: () => void;
}

export function useWallet(): WalletState {
  const [address, setAddress] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setAddress(saved);
    } catch {}
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    window.open(CSPR_CLICK_URL, "_blank", "noopener,noreferrer");
    const userAddress = window.prompt("Paste your Casper Testnet public key from CSPR.click:");
    if (userAddress && userAddress.trim()) {
      const addr = userAddress.trim();
      setAddress(addr);
      localStorage.setItem(STORAGE_KEY, addr);
    }
    setConnecting(false);
  }, []);

  const disconnect = useCallback(() => {
    setAddress("");
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const copyAddress = useCallback(() => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [address]);

  return {
    connected: !!address,
    address,
    connecting,
    copied,
    connect,
    disconnect,
    copyAddress,
  };
}
