import type { MapData } from '@cloudmap/shared';
import type { Editor } from './useEditor';

export type Tool = 'select' | 'addNode' | 'addLink' | 'addLabel';

const tools: { id: Tool; name: string; hint: string }[] = [
  { id: 'select', name: 'Výběr', hint: 'Klikněte na prvek pro úpravu, tažením jej přesunete.' },
  { id: 'addNode', name: 'Přidat uzel', hint: 'Klikněte do mapy, kam uzel umístit.' },
  { id: 'addLink', name: 'Přidat spoj', hint: 'Klikněte postupně na dva uzly, které spoj propojí.' },
  { id: 'addLabel', name: 'Přidat popisek', hint: 'Klikněte do mapy, kam popisek umístit.' },
];

interface Props {
  data: MapData;
  editor: Editor;
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  newNodeTypeId: string;
  onNewNodeTypeChange: (id: string) => void;
  newLinkTypeId: string;
  onNewLinkTypeChange: (id: string) => void;
  message: string;
  onMessageChange: (message: string) => void;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onDiscard: () => void;
  onFinish: () => void;
}

export function EditToolbar(props: Props) {
  const { data, editor, tool } = props;
  const hint = tools.find((t) => t.id === tool)?.hint;

  return (
    <div className="toolbar">
      <div className="toolbar-row">
        <div className="segmented">
          {tools.map((t) => (
            <button key={t.id} type="button" className={tool === t.id ? 'active' : undefined} onClick={() => props.onToolChange(t.id)}>
              {t.name}
            </button>
          ))}
        </div>
        {tool === 'addNode' && (
          <select value={props.newNodeTypeId} onChange={(e) => props.onNewNodeTypeChange(e.target.value)} title="Typ nového uzlu">
            {data.nodeTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        {tool === 'addLink' && (
          <select value={props.newLinkTypeId} onChange={(e) => props.onNewLinkTypeChange(e.target.value)} title="Typ nového spoje">
            {data.linkTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <button type="button" disabled={!editor.canUndo} onClick={editor.undo} title="Zpět (Ctrl+Z)">
          ↶ Zpět
        </button>
        <button type="button" disabled={!editor.canRedo} onClick={editor.redo} title="Znovu (Ctrl+Shift+Z)">
          ↷ Znovu
        </button>

        <span className="spacer" />

        <input
          className="message-input"
          placeholder="Popis změny (nepovinné)"
          value={props.message}
          maxLength={500}
          onChange={(e) => props.onMessageChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && editor.changeCount > 0 && props.onSave()}
        />
        <button type="button" className="primary" disabled={editor.changeCount === 0 || props.saving} onClick={props.onSave}>
          {props.saving ? 'Ukládám…' : `Uložit${editor.changeCount ? ` (${editor.changeCount})` : ''}`}
        </button>
        <button type="button" disabled={editor.changeCount === 0 || props.saving} onClick={props.onDiscard}>
          Zahodit změny
        </button>
        <button type="button" onClick={props.onFinish}>
          Ukončit úpravy
        </button>
      </div>
      <div className="toolbar-row hint">
        {props.error ? <span className="error">{props.error}</span> : hint}
        <span className="muted"> · Delete smaže vybraný prvek, Esc zruší akci.</span>
      </div>
    </div>
  );
}
