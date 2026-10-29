import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import type { MapData, MapLink, MapNode } from '@cloudmap/shared';
import { mapBounds, type Bounds } from './geometry';
import { MapLayers, type MapHighlight } from './MapSvg';

export interface MapViewHandle {
  focusNode: (node: MapNode) => void;
  fit: () => void;
}

interface Props {
  data: MapData;
  highlight: MapHighlight;
  onNodeClick: (node: MapNode) => void;
  onLinkClick: (link: MapLink) => void;
  onBackgroundClick: () => void;
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;

export const MapView = forwardRef<MapViewHandle, Props>(function MapView(
  { data, highlight, onNodeClick, onLinkClick, onBackgroundClick },
  ref,
) {
  const svgRef = useRef<SVGSVGElement>(null);
  const layerRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown>>(null);
  const boundsRef = useRef<Bounds>(mapBounds(data));
  boundsRef.current = mapBounds(data);

  const fitTo = (bounds: Bounds, maxScale = MAX_ZOOM) => {
    const svg = svgRef.current;
    const behavior = zoomRef.current;
    if (!svg || !behavior) return;
    const { width, height } = svg.getBoundingClientRect();
    const scale = Math.min(width / (bounds.maxX - bounds.minX), height / (bounds.maxY - bounds.minY), maxScale);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const transform = zoomIdentity.translate(width / 2 - cx * scale, height / 2 - cy * scale).scale(scale);
    select(svg).call(behavior.transform, transform);
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([MIN_ZOOM, MAX_ZOOM])
      .on('zoom', (event) => layerRef.current?.setAttribute('transform', event.transform.toString()));
    zoomRef.current = behavior;
    select(svg).call(behavior).on('dblclick.zoom', null);
    fitTo(boundsRef.current, 1);
    return () => {
      select(svg).on('.zoom', null);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    focusNode: (node) => {
      const margin = Math.max(node.width, node.height, 200) * 2;
      fitTo(
        { minX: node.x - margin, minY: node.y - margin, maxX: node.x + margin, maxY: node.y + margin },
        2,
      );
    },
    fit: () => fitTo(boundsRef.current, 1),
  }));

  return (
    <svg ref={svgRef} className="map-canvas" onClick={(e) => e.target === e.currentTarget && onBackgroundClick()}>
      <g ref={layerRef}>
        <MapLayers data={data} highlight={highlight} onNodeClick={onNodeClick} onLinkClick={onLinkClick} />
      </g>
    </svg>
  );
});
