import { useState } from 'react';
import { t } from '../../i18n/i18n';
import { useUserStore } from '../../state/userStore';
import type { UserExportData } from '../../types';
import { validateUserExportData } from '../../utils/userData';

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
      const data = validateUserExportData(parsed);
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
