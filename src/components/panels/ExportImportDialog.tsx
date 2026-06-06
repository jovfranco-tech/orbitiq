import { useState } from 'react';
import { t } from '../../i18n/i18n';
import { useUserStore } from '../../state/userStore';
import type { ExecutiveSnapshot, SavedMissionView, UserExportData, WatchlistItem } from '../../types';

interface Props {
  onClose: () => void;
}

export function ExportImportDialog({ onClose }: Props) {
  const store = useUserStore();
  const [importText, setImportText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleExport = () => {
    const data: UserExportData = {
      version: '1.0.0',
      exportedAt: Date.now(),
      watchlists: store.watchlists,
      savedViews: store.savedViews,
      snapshots: store.snapshots,
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orbitiq-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setSuccess(t('export_success') || 'Export downloaded successfully.');
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleImport = () => {
    setError(null);
    setSuccess(null);
    
    if (!importText.trim()) {
      setError(t('import_empty') || 'Please paste JSON data first.');
      return;
    }
    
    try {
      if (importText.length > 250_000) {
        throw new Error(t('import_too_large') || 'Import file too large.');
      }

      const parsed = JSON.parse(importText);
      const data = validateImportData(parsed);
      store.importData(data);
      
      setSuccess(t('import_success') || 'Data imported successfully.');
      setImportText('');
      setTimeout(() => onClose(), 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`${t('invalid_import_file') || 'Invalid import file:'} ${msg}`);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content export-import-dialog glass" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <h2>{t('export_import') || 'Export & Import Data'}</h2>
        
        <p className="ei-desc">
          {t('export_desc') || 'Backup your Watchlists, Saved Views, and Snapshots locally.'}
        </p>

        <div className="ei-actions">
          <button className="ei-export-btn" onClick={handleExport}>
            {t('export_json') || 'Export Data to JSON'}
          </button>
        </div>

        <hr />

        <div className="ei-import">
          <h3>{t('import_data') || 'Import Data'}</h3>
          <p className="ei-warning">
            {t('import_warning') || 'Do not import JSON files from untrusted sources.'}
          </p>
          <textarea 
            placeholder={t('paste_json') || 'Paste JSON contents here...'}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <button className="ei-import-btn" onClick={handleImport}>
            {t('import') || 'Import'}
          </button>
        </div>

        {error && <div className="ei-error">{error}</div>}
        {success && <div className="ei-success">{success}</div>}

        <div className="ei-security-note">
          <small>{t('no_eval_note') || 'Only public satellite metadata and view preferences are stored. Safe JSON parsing enforced.'}</small>
        </div>
      </div>
    </div>
  );
}

function validateImportData(value: unknown): UserExportData {
  if (!isRecord(value)) throw new Error('Not a valid JSON object.');
  if (typeof value.version !== 'string') throw new Error(t('import_schema_required') || 'Missing schema version.');
  if (!Array.isArray(value.watchlists) || !Array.isArray(value.savedViews) || !Array.isArray(value.snapshots)) {
    throw new Error(t('import_arrays_missing') || 'Invalid export format. Missing arrays.');
  }
  if (value.watchlists.length > 500 || value.savedViews.length > 100 || value.snapshots.length > 100) {
    throw new Error(t('import_limit_exceeded') || 'Import exceeds safe item limits.');
  }

  return {
    version: value.version,
    exportedAt: typeof value.exportedAt === 'number' ? value.exportedAt : Date.now(),
    watchlists: value.watchlists.map(parseWatchlistItem),
    savedViews: value.savedViews.map(parseSavedView),
    snapshots: value.snapshots.map(parseSnapshot),
  };
}

function parseWatchlistItem(value: unknown): WatchlistItem {
  if (!isRecord(value)) throw new Error('Invalid watchlist item.');
  return {
    name: safeString(value.name, 120),
    satnum: safeNumber(value.satnum),
    group: safeString(value.group, 40),
    band: safeString(value.band, 20),
    alt: safeNumber(value.alt),
    region: safeString(value.region, 80),
    sourceMode: safeString(value.sourceMode, 20),
    addedAt: safeNumber(value.addedAt),
  };
}

function parseSavedView(value: unknown): SavedMissionView {
  if (!isRecord(value) || !isRecord(value.filters)) throw new Error('Invalid saved view.');
  return {
    id: safeString(value.id, 80),
    name: safeString(value.name, 80),
    description: safeString(value.description, 200),
    filters: {
      groups: Array.isArray(value.filters.groups) ? value.filters.groups.map((g) => safeString(g, 40) as SavedMissionView['filters']['groups'][number]) : [],
      band: value.filters.band === 'LEO' || value.filters.band === 'MEO' || value.filters.band === 'GEO' ? value.filters.band : null,
      region: value.filters.region == null ? null : safeString(value.filters.region, 80),
      altMin: value.filters.altMin == null ? null : safeNumber(value.filters.altMin),
      altMax: value.filters.altMax == null ? null : safeNumber(value.filters.altMax),
    },
    simMode: value.simMode === 'paused' || value.simMode === 'simulating' ? value.simMode : 'live',
    simOffsetMs: clampNumber(value.simOffsetMs, -604800000, 604800000),
    missionScenario: typeof value.missionScenario === 'string' ? value.missionScenario as SavedMissionView['missionScenario'] : null,
    showRiskLayer: value.showRiskLayer === true,
    lang: value.lang === 'es' ? 'es' : 'en',
    createdAt: safeNumber(value.createdAt),
  };
}

function parseSnapshot(value: unknown): ExecutiveSnapshot {
  if (!isRecord(value)) throw new Error('Invalid snapshot.');
  return {
    id: safeString(value.id, 80),
    timestamp: safeNumber(value.timestamp),
    simOffsetMs: clampNumber(value.simOffsetMs, -604800000, 604800000),
    sourceMode: safeString(value.sourceMode, 20),
    totalLoaded: safeNumber(value.totalLoaded),
    visibleCount: safeNumber(value.visibleCount),
    mostCrowdedBand: safeString(value.mostCrowdedBand, 20),
    highestConcentrationRegion: safeString(value.highestConcentrationRegion, 80),
    dominantGroup: safeString(value.dominantGroup, 40),
    selectedSatellite: null,
    executiveBrief: null,
    missionBrief: null,
    riskLayerSummary: null,
    caveats: Array.isArray(value.caveats) ? value.caveats.map((c) => safeString(c, 240)).slice(0, 10) : [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeString(value: unknown, max: number): string {
  if (typeof value !== 'string') throw new Error('Invalid string field.');
  return value.slice(0, max);
}

function safeNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid number field.');
  return value;
}

function clampNumber(value: unknown, min: number, max: number): number {
  return Math.max(min, Math.min(max, safeNumber(value)));
}
