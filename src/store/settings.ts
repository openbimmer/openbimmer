import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { EngineId } from '@/data/engines';
import { DEFAULT_UNITS, type Units } from '@/lib/units';
import type { ChannelId } from '@/obd/pids';

export type SavedAdapter = { id: string; name: string };

type SettingsState = {
  engineId: EngineId | null;
  nickname: string;
  units: Units;
  hero: ChannelId;
  tiles: ChannelId[];
  logChannels: ChannelId[];
  keepAwake: boolean;
  shiftLight: boolean;
  haptics: boolean;
  lastAdapter: SavedAdapter | null;
  autoConnect: boolean;
  acceptedNotice: boolean;
  setEngine: (id: EngineId) => void;
  setNickname: (name: string) => void;
  setUnit: <K extends keyof Units>(key: K, value: Units[K]) => void;
  setHero: (id: ChannelId) => void;
  setTile: (index: number, id: ChannelId) => void;
  setLogChannels: (ids: ChannelId[]) => void;
  toggle: (key: 'keepAwake' | 'shiftLight' | 'haptics' | 'autoConnect') => void;
  rememberAdapter: (adapter: SavedAdapter | null) => void;
  acceptNotice: () => void;
  reset: () => void;
};

export const DEFAULT_TILES: ChannelId[] = ['speed', 'throttle', 'timing', 'iat', 'coolant', 'oil', 'afr', 'rail'];

export const DEFAULT_LOG_CHANNELS: ChannelId[] = [
  'rpm',
  'speed',
  'boost',
  'boostTarget',
  'throttle',
  'pedal',
  'load',
  'timing',
  'iat',
  'coolant',
  'oil',
  'lambda',
  'lambdaTarget',
  'rail',
  'maf',
  'stft1',
  'torque',
  'power',
];

const defaults = {
  engineId: null,
  nickname: '',
  units: DEFAULT_UNITS,
  hero: 'boost' as ChannelId,
  tiles: DEFAULT_TILES,
  logChannels: DEFAULT_LOG_CHANNELS,
  keepAwake: true,
  shiftLight: true,
  haptics: true,
  lastAdapter: null,
  autoConnect: true,
  acceptedNotice: false,
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaults,
      setEngine: (engineId) => set({ engineId }),
      setNickname: (nickname) => set({ nickname }),
      setUnit: (key, value) => set((s) => ({ units: { ...s.units, [key]: value } })),
      setHero: (hero) => set({ hero }),
      setTile: (index, id) =>
        set((s) => {
          const tiles = [...s.tiles];
          tiles[index] = id;
          return { tiles };
        }),
      setLogChannels: (logChannels) => set({ logChannels }),
      toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<SettingsState>),
      rememberAdapter: (lastAdapter) => set({ lastAdapter }),
      acceptNotice: () => set({ acceptedNotice: true }),
      reset: () => set({ ...defaults }),
    }),
    {
      name: 'openbimmer-settings',
      storage: createJSONStorage(() => ({
        getItem: (key: string) => Storage.getItemSync(key),
        setItem: (key: string, value: string) => Storage.setItemSync(key, value),
        removeItem: (key: string) => {
          Storage.removeItemSync(key);
        },
      })),
      version: 1,
    },
  ),
);
