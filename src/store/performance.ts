import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { EngineId } from '@/data/engines';
import { PERF_TEST_MAP, PERF_TESTS, type PerfTestId } from '@/lib/perf-timer';

export type PerfSource = 'gps' | 'obd';

export type PerfResult = {
  id: string;
  test: PerfTestId;
  time: number;
  date: number;
  source: PerfSource;
  maxSpeed: number;
  distance: number;
  engineId: EngineId | null;
  trapSpeed?: number;
};

export type NewPerfResult = Omit<PerfResult, 'id' | 'date'> & { date?: number };

type BestTimes = Partial<Record<PerfTestId, PerfResult>>;

type PerformanceState = {
  results: PerfResult[];
  best: BestTimes;
  selectedTest: PerfTestId;
  safetyAccepted: boolean;
  addResult: (result: NewPerfResult) => { result: PerfResult; isBest: boolean };
  deleteResult: (id: string) => void;
  clearResults: (test?: PerfTestId) => void;
  selectTest: (test: PerfTestId) => void;
  acceptSafety: () => void;
};

const MAX_RESULTS = 500;

function computeBest(results: PerfResult[]): BestTimes {
  const best: BestTimes = {};
  for (const r of results) {
    const current = best[r.test];
    if (!current || r.time < current.time) best[r.test] = r;
  }
  return best;
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const usePerformance = create<PerformanceState>()(
  persist(
    (set, get) => ({
      results: [],
      best: {},
      selectedTest: PERF_TESTS[0].id,
      safetyAccepted: false,
      addResult: (input) => {
        const result: PerfResult = { ...input, id: newId(), date: input.date ?? Date.now() };
        const previous = get().best[result.test];
        const isBest = !previous || result.time < previous.time;
        const results = [result, ...get().results].slice(0, MAX_RESULTS);
        set({ results, best: computeBest(results) });
        return { result, isBest };
      },
      deleteResult: (id) =>
        set((s) => {
          const results = s.results.filter((r) => r.id !== id);
          return { results, best: computeBest(results) };
        }),
      clearResults: (test) =>
        set((s) => {
          const results = test ? s.results.filter((r) => r.test !== test) : [];
          return { results, best: computeBest(results) };
        }),
      selectTest: (selectedTest) => set({ selectedTest }),
      acceptSafety: () => set({ safetyAccepted: true }),
    }),
    {
      name: 'openbimmer-performance',
      storage: createJSONStorage(() => ({
        getItem: (key: string) => Storage.getItemSync(key),
        setItem: (key: string, value: string) => Storage.setItemSync(key, value),
        removeItem: (key: string) => {
          Storage.removeItemSync(key);
        },
      })),
      version: 1,
      partialize: (s) => ({ results: s.results, selectedTest: s.selectedTest, safetyAccepted: s.safetyAccepted }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PerformanceState>;
        const results = Array.isArray(saved.results) ? saved.results.filter((r) => r && PERF_TEST_MAP[r.test]) : current.results;
        const selectedTest = saved.selectedTest && PERF_TEST_MAP[saved.selectedTest] ? saved.selectedTest : current.selectedTest;
        return {
          ...current,
          results,
          best: computeBest(results),
          selectedTest,
          safetyAccepted: saved.safetyAccepted ?? current.safetyAccepted,
        };
      },
    },
  ),
);
