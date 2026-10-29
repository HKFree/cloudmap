import { forwardRef, useEffect, useImperativeHandle, useRef, type MouseEvent, type PointerEvent } from 'react';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import type { MapData, Point } from '@cloudmap/shared';
import type { DragRef, ItemRef } from '../editor/operations';
import { mapBounds, type Bounds } from './geometry';
import { MapLayers, type MapHighlight } from './MapSvg';

export interface MapViewHandle {
  focus: (bounds: Bounds) => void;
  fit: () => void;
}

/** Hit target under the pointer; `linkLabel` is the caption of a link. */
type Target = { kind: ItemRef['kind'] | 'linkLabel'; id: string };

interface Props {
  data: MapData;
  highlight: MapHighlight;
  editing: boolean;
  /** Dragging items is possible only in edit mode with this flag on. */
  canDrag: boolean;
  cursorClass?: string;
  onItemClick: (item: ItemRef) => void;
  onBackgroundClick: (at: Point) => void;
  onDragStart: (item: DragRef) => void;
  onDragMove: (item: DragRef, dx: number, dy: number) => void;
  onDragEnd: (item: DragRef) => void;
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

const asItem = ({ kind, id }: Target): ItemRef => ({ kind: kind === 'linkLabel' ? 'link' : kind, id });
const isDraggable = (target: Target | null): target is DragRef => target !== null && target.kind !== 'link';

export const MapView = forwardRef<MapViewHandle, Props>(function MapView(props, ref) {
  const { data, highlight, editing, canDrag, cursorClass } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const layerRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown>>(null);
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const boundsRef = useRef<Bounds>(mapBounds(data));
  boundsRef.current = mapBounds(data);

  // Latest props for the d3 and pointer handlers registered once.
  const propsRef = useRef(props);
  propsRef.current = props;

  const initialFitDone = useRef(false);
  const drag = useRef<{ target: DragRef; start: Point; client: Point; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const toMap = (clientX: number, clientY: number): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    const [x, y] = transformRef.current.invert([clientX - rect.left, clientY - rect.top]);
    return { x, y };
  };

  const fitTo = (bounds: Bounds, maxScale = MAX_ZOOM) => {
    const svg = svgRef.current;
    const behavior = zoomRef.current;
    if (!svg || !behavior) return;
    const { width, height } = svg.getBoundingClientRect();
    const scale = Math.min(width / (bounds.maxX - bounds.minX), height / (bounds.maxY - bounds.minY), maxScale);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    select(svg).call(behavior.transform, zoomIdentity.translate(width / 2 - cx * scale, height / 2 - cy * scale).scale(scale));
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
      });
    zoomRef.current = behavior;
    select(svg).call(behavior).on('dblclick.zoom', null);
    // Fit only once; a re-run must not override a focus requested meanwhile.
    if (!initialFitDone.current) fitTo(boundsRef.current, 1);
    initialFitDone.current = true;
    return () => {
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
    if (!editing || !canDrag || event.button !== 0 || !isDraggable(target)) return;
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
    if (!current.moved) props.onItemClick(asItem(current.target));
  };

  const onClick = (event: MouseEvent<SVGSVGElement>) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const target = targetOf(event.target);
    if (target) props.onItemClick(asItem(target));
    else props.onBackgroundClick(toMap(event.clientX, event.clientY));
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
    >
      <g ref={layerRef}>
        <MapLayers data={data} highlight={highlight} interactive editing={editing} />
      </g>
    </svg>
  );
});
