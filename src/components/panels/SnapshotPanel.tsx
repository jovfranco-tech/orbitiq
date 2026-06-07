import { useEffect, useRef, useState } from 'react';
import { t } from '../../i18n/i18n';
import { useUserStore } from '../../state/userStore';
import type { ExecutiveSnapshot } from '../../types';
import { buildExecutiveSnapshotMarkdown } from '../../utils/reports';
import { ExportImportDialog } from './ExportImportDialog';

interface Props {
  onClose: () => void;
}

export function SnapshotPanel({ onClose }: Props) {
  const { snapshots, deleteSnapshot } = useUserStore();
  const [showEI, setShowEI] = useState(false);
  const [copiedSnapshotId, setCopiedSnapshotId] = useState<string | null>(null);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const handleExportMarkdown = (snap: ExecutiveSnapshot) => {
    if (!navigator.clipboard) {
      setCopiedSnapshotId(null);
      return;
    }

    void navigator.clipboard.writeText(buildExecutiveSnapshotMarkdown(snap)).then(() => {
      if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
      setCopiedSnapshotId(snap.id);
      copiedTimerRef.current = window.setTimeout(() => setCopiedSnapshotId(null), 2400);
    }).catch(() => {
      setCopiedSnapshotId(null);
    });
  };

  return (
    <aside className="left-panel snapshot-panel glass">
      <div className="panel-header">
        <h2>{t('executive_snapshots') || 'Executive Snapshots'}</h2>
        <button className="panel-close" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="panel-body">
        {snapshots.length === 0 ? (
          <div className="panel-empty">{t('no_snapshots') || 'No snapshots saved.'}</div>
        ) : (
          <div className="snapshot-list">
            {snapshots.map(s => (
              <div key={s.id} className="snapshot-card">
                <div className="snapshot-visual">
                  <div className="snapshot-orbit-map" aria-hidden="true">
                    <span />
                    <i />
                    <b />
                  </div>
                  <div className="snapshot-scoreboard">
                    <div>
                      <span>Assets</span>
                      <strong>{s.visibleCount.toLocaleString()}</strong>
                    </div>
                    <div>
                      <span>Band</span>
                      <strong>{s.mostCrowdedBand}</strong>
                    </div>
                    <div>
                      <span>Mode</span>
                      <strong>{s.sourceMode}</strong>
                    </div>
                  </div>
                </div>
                <div className="s-header">
                  <div className="s-date">{new Date(s.timestamp).toLocaleString()}</div>
                  <button 
                    className="s-remove" 
                    onClick={() => deleteSnapshot(s.id)}
                    title={t('delete') || 'Delete'}
                  >
                    ✕
                  </button>
                </div>
                <div className="s-body">
                  <p><strong>Total:</strong> {s.visibleCount.toLocaleString()} objects</p>
                  <p><strong>Hotspot:</strong> {s.highestConcentrationRegion}</p>
                  {s.missionBrief && <p><strong>Mission:</strong> {s.missionBrief.title}</p>}
                  {s.riskLayerSummary && <p><strong>Risk:</strong> {s.riskLayerSummary.score}/100 · {s.riskLayerSummary.level}</p>}
                  {s.selectedSatellite && <p><strong>Target:</strong> {s.selectedSatellite.name}</p>}
                </div>
                <div className="s-actions">
                  <button className="export-md-btn" onClick={() => handleExportMarkdown(s)}>
                    {copiedSnapshotId === s.id ? t('markdown_copied') : t('export_markdown')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div className="panel-footer">
        <button className="ei-toggle-btn" onClick={() => setShowEI(true)}>
          {t('export_import') || 'Export / Import Data'}
        </button>
        <small style={{display: 'block', marginTop: '10px'}}>{t('local_storage_note') || 'Saved locally in this browser. Only public metadata stored.'}</small>
      </div>

      {showEI && <ExportImportDialog onClose={() => setShowEI(false)} />}
    </aside>
  );
}
