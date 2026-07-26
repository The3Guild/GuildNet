"use client";

import { useState, useEffect, useCallback } from "react";
import type { TaskRecord } from "./use-tasks";

const STORAGE_KEY = "guildnet:task-history";

function readHistory(): TaskRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function useTaskHistory() {
  const [history, setHistory] = useState<TaskRecord[]>(readHistory);

  const addTask = useCallback((task: TaskRecord) => {
    setHistory(prev => {
      const next = [task, ...prev].slice(0, 50); // keep last 50
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setHistory([]);
  }, []);

  return { history, addTask, clearHistory };
}
