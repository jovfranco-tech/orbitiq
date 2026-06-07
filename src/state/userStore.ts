import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WatchlistItem, SavedMissionView, ExecutiveSnapshot, UserExportData } from '../types';

interface UserState {
  watchlists: WatchlistItem[];
  savedViews: SavedMissionView[];
  snapshots: ExecutiveSnapshot[];
  showWatchlistPanel: boolean;
  showSavedViewsPanel: boolean;
  showSnapshotPanel: boolean;
  hasSeenTour: boolean;
  
  // Panel UI toggles
  setShowWatchlistPanel: (v: boolean) => void;
  setShowSavedViewsPanel: (v: boolean) => void;
  setShowSnapshotPanel: (v: boolean) => void;
  setHasSeenTour: (v: boolean) => void;
  
  // Watchlist
  addToWatchlist: (item: Omit<WatchlistItem, 'addedAt'>) => void;
  removeFromWatchlist: (satnum: number) => void;
  
  // Saved Views
  saveView: (view: Omit<SavedMissionView, 'id' | 'createdAt'>) => void;
  deleteView: (id: string) => void;
  renameView: (id: string, name: string) => void;
  
  // Snapshots
  createSnapshot: (snap: Omit<ExecutiveSnapshot, 'id' | 'timestamp'>) => void;
  deleteSnapshot: (id: string) => void;
  
  // Import/Export
  importData: (data: UserExportData) => void;
}

function generateId() {
  return Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString(36);
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      watchlists: [],
      savedViews: [],
      snapshots: [],
      showWatchlistPanel: false,
      showSavedViewsPanel: false,
      showSnapshotPanel: false,
      hasSeenTour: false,
      
      setShowWatchlistPanel: (v) => set({ showWatchlistPanel: v, showSavedViewsPanel: false, showSnapshotPanel: false }),
      setShowSavedViewsPanel: (v) => set({ showSavedViewsPanel: v, showWatchlistPanel: false, showSnapshotPanel: false }),
      setShowSnapshotPanel: (v) => set({ showSnapshotPanel: v, showWatchlistPanel: false, showSavedViewsPanel: false }),
      setHasSeenTour: (v) => set({ hasSeenTour: v }),
      
      addToWatchlist: (item) => set((state) => {
        if (state.watchlists.some(w => w.satnum === item.satnum)) return state;
        return { watchlists: [{ ...item, addedAt: Date.now() }, ...state.watchlists] };
      }),
      
      removeFromWatchlist: (satnum) => set((state) => ({
        watchlists: state.watchlists.filter(w => w.satnum !== satnum)
      })),
      
      saveView: (view) => set((state) => ({
        savedViews: [{ ...view, id: generateId(), createdAt: Date.now() }, ...state.savedViews]
      })),
      
      deleteView: (id) => set((state) => ({
        savedViews: state.savedViews.filter(v => v.id !== id)
      })),
      
      renameView: (id, name) => set((state) => ({
        savedViews: state.savedViews.map(v => v.id === id ? { ...v, name } : v)
      })),
      
      createSnapshot: (snap) => set((state) => ({
        snapshots: [{ ...snap, id: generateId(), timestamp: Date.now() }, ...state.snapshots]
      })),
      
      deleteSnapshot: (id) => set((state) => ({
        snapshots: state.snapshots.filter(s => s.id !== id)
      })),
      
      importData: (data) => set((state) => {
        // Merge strategy: keep existing, prepend new unique ones
        const mergedWatchlists = [...state.watchlists];
        data.watchlists.forEach(w => {
          if (!mergedWatchlists.some(mw => mw.satnum === w.satnum)) mergedWatchlists.unshift(w);
        });
        
        const mergedViews = [...state.savedViews];
        data.savedViews.forEach(v => {
          if (!mergedViews.some(mv => mv.id === v.id)) mergedViews.unshift(v);
        });
        
        const mergedSnaps = [...state.snapshots];
        data.snapshots.forEach(s => {
          if (!mergedSnaps.some(ms => ms.id === s.id)) mergedSnaps.unshift(s);
        });
        
        return {
          watchlists: mergedWatchlists,
          savedViews: mergedViews,
          snapshots: mergedSnaps
        };
      }),
    }),
    {
      name: 'orbitiq-user-data',
      version: 1,
      migrate: (persisted, fromVersion) => {
        // v0 → v1: no structural change, just stamp version
        if (fromVersion === 0) return persisted;
        return persisted;
      },
      partialize: (state) => ({
        watchlists: state.watchlists,
        savedViews: state.savedViews,
        snapshots: state.snapshots,
        hasSeenTour: state.hasSeenTour,
      }), // only persist data, not UI toggles
    }
  )
);
