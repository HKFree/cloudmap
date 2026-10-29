import type { MapData } from '@cloudmap/shared';
import type { Editor } from './useEditor';

export type Tool = 'select' | 'addNode' | 'addLink' | 'addLabel';

const tools: { id: Tool; name: string; hint: string }[] = [
  { id: 'select', name: 'Výběr', hint: 'Klik vybere, tažení přesune.' },
  { id: 'addNode', name: '+ Uzel', hint: 'Klikněte do mapy, kam uzel umístit.' },
  { id: 'addLink', name: '+ Spoj', hint: 'Klikněte postupně na dva uzly, které spoj propojí.' },
  { id: 'addLabel', name: '+ Popisek', hint: 'Klikněte do mapy, kam popisek umístit.' },
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
    <section className="panel edit-panel">
      <div className="panel-header">
        <h2>Úpravy mapy</h2>
        <div className="toolbar-row">
          <button type="button" disabled={!editor.canUndo} onClick={editor.undo} title="Zpět (Ctrl+Z)">
            ↶
          </button>
          <button type="button" disabled={!editor.canRedo} onClick={editor.redo} title="Znovu (Ctrl+Shift+Z)">
            ↷
          </button>
        </div>
      </div>

      <div className="toolbar-row">
        <span className="muted">Nástroj:</span>
        <div className="segmented">
          {tools.map((t) => (
            <button key={t.id} type="button" className={tool === t.id ? 'active' : undefined} onClick={() => props.onToolChange(t.id)}>
              {t.name}
            </button>
          ))}
        </div>
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
      <p className="hint">{hint}</p>
      <ul className="shortcuts">
        <li>
          <kbd>Del</kbd> smazat
        </li>
        <li>
          <kbd>Esc</kbd> zrušit
        </li>
        <li>
          <kbd>Ctrl</kbd>+<kbd>Z</kbd> zpět
        </li>
        <li>
          <kbd>Ctrl</kbd>+<kbd>⇧</kbd>+<kbd>Z</kbd> znovu
        </li>
      </ul>

      <input
        className="message-input"
        placeholder="Popis změny (nepovinné)"
        value={props.message}
        maxLength={500}
        onChange={(e) => props.onMessageChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && editor.changeCount > 0 && props.onSave()}
      />
      {props.error && <p className="error">{props.error}</p>}
      <div className="toolbar-row">
        <button type="button" className="primary" disabled={editor.changeCount === 0 || props.saving} onClick={props.onSave}>
          {props.saving ? 'Ukládám…' : `Uložit${editor.changeCount ? ` (${editor.changeCount})` : ''}`}
        </button>
        <button type="button" disabled={editor.changeCount === 0 || props.saving} onClick={props.onDiscard}>
          Zahodit změny
        </button>
        <span className="spacer" />
        <button type="button" onClick={props.onFinish}>
          Ukončit úpravy
        </button>
      </div>
    </section>
  );
}
