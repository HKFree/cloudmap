import { useState } from 'react';
import type { MapData } from '@cloudmap/shared';

const dateFormat = new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' });

export function Footer({ data }: { data: MapData | null }) {
  const [exporting, setExporting] = useState(false);

  // Export pulls in react-dom/server, so it is loaded only when needed.
  const runExport = async (format: 'svg' | 'png') => {
    if (!data) return;
    setExporting(true);
    try {
      const { downloadPng, downloadSvg } = await import('../map/export');
      if (format === 'png') await downloadPng(data, 'hkfree-cloud-map.png');
      else downloadSvg(data, 'hkfree-cloud-map.svg');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Export selhal');
    } finally {
      setExporting(false);
    }
  };

  return (
    <footer className="footer">
      <span>hkfree cloudmap v{__APP_VERSION__}</span>
      {data?.revision && (
        <span className="muted">
          Revize #{data.revision.id} z {dateFormat.format(new Date(data.revision.createdAt))}
        </span>
      )}
      <span className="spacer" />
      <button type="button" disabled={!data || exporting} onClick={() => runExport('svg')}>
        Stáhnout SVG
      </button>
      <button type="button" disabled={!data || exporting} onClick={() => runExport('png')}>
        {exporting ? 'Exportuji…' : 'Stáhnout PNG'}
      </button>
      <a href="/api/v1/docs" target="_blank" rel="noreferrer">
        API
      </a>
    </footer>
  );
}
