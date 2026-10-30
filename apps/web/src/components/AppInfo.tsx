import { useEffect, useState } from 'react';
import type { CurrentUser, MapData } from '@cloudmap/shared';
import { fetchCurrentUser } from '../api';

/** Version, author and export at the bottom of the sidebar. */
export function AppInfo({ data }: { data: MapData | null }) {
  const [exporting, setExporting] = useState(false);
  const [current, setCurrent] = useState<CurrentUser | null>(null);

  useEffect(() => {
    fetchCurrentUser().then(setCurrent, () => {});
  }, []);

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
    <section className="app-info">
      <div className="toolbar-row">
        <button type="button" disabled={!data || exporting} onClick={() => runExport('svg')}>
          Stáhnout SVG
        </button>
        <button type="button" disabled={!data || exporting} onClick={() => runExport('png')}>
          {exporting ? 'Exportuji…' : 'Stáhnout PNG'}
        </button>
        <span className="spacer" />
        <a href="/api/v1/docs" target="_blank" rel="noreferrer">
          API
        </a>
      </div>
      {current && <UserRow current={current} />}
      <div className="muted small">
        <a href="https://github.com/HKFree/cloudmap" target="_blank" rel="noreferrer">
          hkfree cloudmap
        </a>{' '}
        v{__APP_VERSION__} · pro hkfree.org vyrobil OndraLhota
      </div>
    </section>
  );
}

function UserRow({ current }: { current: CurrentUser }) {
  if (current.devMode) {
    return (
      <div className="small dev-mode" title="DEV_MODE=true – přihlašování je vypnuté">
        Vývojový režim bez přihlášení, změny se ukládají jako „dev“
      </div>
    );
  }
  return (
    <div className="toolbar-row small">
      <span>
        Přihlášen: <strong>{current.user.name}</strong>
      </span>
      <span className="spacer" />
      <a href="/auth/logout">Odhlásit</a>
    </div>
  );
}
