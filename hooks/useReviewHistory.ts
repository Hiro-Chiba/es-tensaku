"use client";

import { useCallback, useEffect, useState } from "react";
import { openDB, type IDBPDatabase } from "idb";
import type { ReviewRecord } from "@/lib/types";

const DB_NAME = "es-tensaku-history";
const STORE_NAME = "reviews";
const DB_VERSION = 1;

async function initDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    }
  });
}

export function useReviewHistory() {
  const [records, setRecords] = useState<ReviewRecord[]>([]);
  const [isReady, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const db = await initDb();
      const tx = db.transaction(STORE_NAME, "readonly");
      const allRecords = (await tx.store.getAll()) as ReviewRecord[];
      if (mounted) {
        setRecords(allRecords.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1)).slice(0, 5));
        setReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const saveRecord = useCallback(async (record: ReviewRecord) => {
    const db = await initDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    await tx.store.put(record);
    await tx.done;
    setRecords((prev) => {
      const next = [record, ...prev.filter((item) => item.id !== record.id)].slice(0, 5);
      return next;
    });
  }, []);

  const clearHistory = useCallback(async () => {
    const db = await initDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    await tx.store.clear();
    await tx.done;
    setRecords([]);
  }, []);

  return { records, saveRecord, clearHistory, isReady };
}
