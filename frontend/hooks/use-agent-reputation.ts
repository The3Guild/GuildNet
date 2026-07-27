"use client";

import { useState, useEffect } from "react";
import { BACKEND_URL } from "@/lib/constants";

export interface ReputationData {
  tasksCompleted: number;
  tasksFailed:    number;
  score:          number;
  lastUpdated:    number;
}

export interface ReputationEvent {
  agent:        string;
  taskId:       string;
  success:      boolean;
  timestamp:    number;
  deployHash?:  string;
}

export function useAgentReputation(accountHash: string | undefined) {
  const [reputation, setReputation] = useState<ReputationData | null>(null);
  const [events, setEvents]         = useState<ReputationEvent[]>([]);
  const [loading, setLoading]       = useState(!!accountHash);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    if (!accountHash) return;
    let cancelled = false;

    async function fetchReputation() {
      try {
        const res = await window.fetch(`${BACKEND_URL}/agents/${accountHash}/reputation`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setReputation(data.reputation ?? null);
        setEvents(data.events ?? []);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchReputation();
    return () => { cancelled = true; };
  }, [accountHash]);

  return { reputation, events, loading, error };
}
