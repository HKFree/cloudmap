import type { LinkType, MapData } from '@cloudmap/shared';
import { createLinkType, deleteLinkType, moveLinkType, patchItem, upsertItem } from './operations';
import type { Editor } from './useEditor';

const dashPresets: { value: string; name: string }[] = [
  { value: '', name: 'Plná' },
  { value: '8 8', name: 'Čárkovaná' },
  { value: '20 20', name: 'Dlouhé čárky' },
  { value: '2 2', name: 'Tečkovaná' },
];

export function LinkTypesPanel({ data, editor }: { data: MapData; editor: Editor }) {
  const usage = new Map<string, number>();
  for (const link of data.links) usage.set(link.typeId, (usage.get(link.typeId) ?? 0) + 1);

  const edit = (type: LinkType, patch: Partial<LinkType>, field: string) =>
    editor.apply((m) => patchItem(m, 'linkTypes', type.id, patch), `linkType:${type.id}:${field}`);

  return (
    <details className="panel" open>
      <summary>Typy spojů</summary>
      <ul className="type-list">
        {data.linkTypes.map((type, index) => {
          const used = usage.get(type.id) ?? 0;
          const presets = dashPresets.some((p) => p.value === type.dash)
            ? dashPresets
            : [...dashPresets, { value: type.dash, name: `Vlastní (${type.dash})` }];
          return (
            <li key={type.id}>
              <input type="color" value={type.color} title="Barva" onChange={(e) => edit(type, { color: e.target.value }, 'color')} />
              <input className="grow" value={type.name} title="Název" onChange={(e) => edit(type, { name: e.target.value }, 'name')} />
              <input
                type="number"
                className="narrow"
                min={1}
                value={type.width}
                title="Tloušťka čáry"
                onChange={(e) => Number(e.target.value) > 0 && edit(type, { width: Number(e.target.value) }, 'width')}
              />
              <select value={type.dash} title="Styl čáry" onChange={(e) => edit(type, { dash: e.target.value }, 'dash')}>
                {presets.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.name}
                  </option>
                ))}
              </select>
              <span className="muted usage" title="Počet spojů">
                {used}×
              </span>
              <button type="button" title="Posunout výš" disabled={index === 0} onClick={() => editor.apply((m) => moveLinkType(m, type.id, -1))}>
                ↑
              </button>
              <button
                type="button"
                title="Posunout níž"
                disabled={index === data.linkTypes.length - 1}
                onClick={() => editor.apply((m) => moveLinkType(m, type.id, 1))}
              >
                ↓
              </button>
              <button
                type="button"
                title={used ? 'Typ používají spoje, nelze smazat' : 'Smazat typ'}
                disabled={used > 0}
                onClick={() => editor.apply((m) => deleteLinkType(m, type.id))}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={() => editor.apply((m) => upsertItem(m, 'linkTypes', createLinkType(m.linkTypes)))}>
        Přidat typ spoje
      </button>
    </details>
  );
}
