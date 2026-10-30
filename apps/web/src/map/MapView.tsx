import { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import type { MapData, Point } from '@cloudmap/shared';
import { itemOf, type DragRef, type ItemRef } from '../editor/operations';
import { EditHandles } from './EditHandles';
import { mapBounds, type Bounds } from './geometry';
import { MapLayers, type MapHighlight } from './MapSvg';
import { Ghosts, MarkHalos, type MapMarks } from './MarksOverlay';

export interface MapViewHandle {
  focus: (bounds: Bounds) => void;
  fit: () => void;
}

/** Hit target under the pointer: a map item, a link caption or an edit handle. */
type Target = { kind: ItemRef['kind'] | DragRef['kind']; id: string };

interface Props {
  data: MapData;
  highlight: MapHighlight;
  marks?: MapMarks | null;
  editing: boolean;
  /** Dragging items is possible only in edit mode with this flag on. */
  canDrag: boolean;
  cursorClass?: string;
  onItemClick: (item: ItemRef) => void;
  onBackgroundClick: (at: Point) => void;
  onDragStart: (item: DragRef) => void;
  onDragMove: (item: DragRef, dx: number, dy: number) => void;
  onDragEnd: (item: DragRef) => void;
  /** Double click on a polyline vertex or a stub end. */
  onPointRemove: (pointId: string) => void;
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;
const CLICK_TOLERANCE_PX = 3;

function targetOf(element: EventTarget | null): Target | null {
  const found = element instanceof Element ? element.closest('[data-kind]') : null;
  const kind = found?.getAttribute('data-kind');
  const id = found?.getAttribute('data-id');
  return kind && id ? { kind: kind as Target['kind'], id } : null;
}

const isDraggable = (target: Target | null): target is DragRef => target !== null && target.kind !== 'link';

/** The map itself re-renders only when data or highlight change, not on every zoom step. */
const Layers = memo(MapLayers);
const Halos = memo(MarkHalos);

export const MapView = forwardRef<MapViewHandle, Props>(function MapView(props, ref) {
  const { data, highlight, editing, canDrag, cursorClass } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const layerRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown>>(null);
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const [zoomLevel, setZoomLevel] = useState(1);
  const boundsRef = useRef<Bounds>(mapBounds(data));
  boundsRef.current = mapBounds(data);

  // Latest props for the d3 and pointer handlers registered once.
  const propsRef = useRef(props);
  propsRef.current = props;

  const initialFitDone = useRef(false);
  const drag = useRef<{ target: DragRef; start: Point; client: Point; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  /** Pointer capture retargets click events to the <svg>, so remember what was pressed. */
  const pressedTarget = useRef<Target | null>(null);

  const toMap = (clientX: number, clientY: number): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    const [x, y] = transformRef.current.invert([clientX - rect.left, clientY - rect.top]);
    return { x, y };
  };

  /** Returns false when the map has no size yet, e.g. while hidden behind a full-width panel. */
  const fitTo = (bounds: Bounds, maxScale = MAX_ZOOM) => {
    const svg = svgRef.current;
    const behavior = zoomRef.current;
    if (!svg || !behavior) return false;
    const { width, height } = svg.getBoundingClientRect();
    if (width === 0 || height === 0) return false;
    const fitScale = Math.min(width / (bounds.maxX - bounds.minX), height / (bounds.maxY - bounds.minY), maxScale);
    const scale = Math.max(fitScale, MIN_ZOOM);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    select(svg).call(behavior.transform, zoomIdentity.translate(width / 2 - cx * scale, height / 2 - cy * scale).scale(scale));
    return true;
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([MIN_ZOOM, MAX_ZOOM])
      .filter((event) => {
        if (event.type === 'wheel') return true;
        if (event.ctrlKey || event.button) return false;
        // Pressing on a draggable item starts moving the item instead of panning.
        const { editing, canDrag } = propsRef.current;
        return !(editing && canDrag && isDraggable(targetOf(event.target)));
      })
      .on('zoom', (event) => {
        transformRef.current = event.transform;
        layerRef.current?.setAttribute('transform', event.transform.toString());
        setZoomLevel(event.transform.k);
      });
    zoomRef.current = behavior;
    select(svg).call(behavior).on('dblclick.zoom', null);
    // Fit only once, as soon as the map has a size; a re-run must not override a focus requested meanwhile.
    const fitInitially = () => {
      if (!initialFitDone.current) initialFitDone.current = fitTo(boundsRef.current, 1);
    };
    fitInitially();
    const resizeObserver = new ResizeObserver(fitInitially);
    resizeObserver.observe(svg);
    return () => {
      resizeObserver.disconnect();
      select(svg).on('.zoom', null);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    focus: (bounds) => fitTo(bounds, 2),
    fit: () => fitTo(boundsRef.current, 1),
  }));

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    suppressClick.current = false;
    const target = targetOf(event.target);
    pressedTarget.current = target;
    if (!editing || !canDrag || event.button !== 0 || !isDraggable(target)) return;
    // Without this the browser starts selecting text under the moving pointer and may
    // then begin a native drag of the selection, which cancels our drag midway.
    event.preventDefault();
    drag.current = { target, start: toMap(event.clientX, event.clientY), client: { x: event.clientX, y: event.clientY }, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    props.onDragStart(target);
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const current = drag.current;
    if (!current) return;
    if (!current.moved && Math.hypot(event.clientX - current.client.x, event.clientY - current.client.y) < CLICK_TOLERANCE_PX) return;
    current.moved = true;
    const at = toMap(event.clientX, event.clientY);
    props.onDragMove(current.target, at.x - current.start.x, at.y - current.start.y);
  };

  // With pointer capture the browser reports the click on the <svg>, so a press
  // on a draggable item is resolved here and the following click is ignored.
  const onPointerUp = () => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    suppressClick.current = true;
    props.onDragEnd(current.target);
    if (!current.moved) props.onItemClick(itemOf(current.target));
  };

  const onClick = (event: MouseEvent<SVGSVGElement>) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const target = targetOf(event.target);
    if (target) props.onItemClick(itemOf(target));
    else props.onBackgroundClick(toMap(event.clientX, event.clientY));
  };

  const onDoubleClick = (event: MouseEvent<SVGSVGElement>) => {
    const target = targetOf(event.target) ?? pressedTarget.current;
    if (editing && target?.kind === 'linkPoint') props.onPointRemove(target.id);
  };

  return (
    <svg
      ref={svgRef}
      className={['map-canvas', editing && 'editing', cursorClass].filter(Boolean).join(' ')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onDragStart={(event) => event.preventDefault()}
    >
      <g ref={layerRef}>
        {props.marks && <Halos data={data} marks={props.marks} />}
        <Layers data={data} highlight={highlight} interactive editing={editing} />
        {props.marks?.ghosts && <Ghosts ghosts={props.marks.ghosts} />}
        {editing && <EditHandles data={data} selection={highlight.selection ?? null} zoom={zoomLevel} />}
      </g>
    </svg>
  );
});
