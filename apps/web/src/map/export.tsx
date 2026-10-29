import { renderToStaticMarkup } from 'react-dom/server';
import type { MapData } from '@cloudmap/shared';
import { mapBounds } from './geometry';
import { Legend, LEGEND_WIDTH } from './Legend';
import { ExportSvg } from './MapSvg';

const LEGEND_GAP = 40;
const LEGEND_SCALE = 2;

/** Standalone SVG of the whole map with the legend placed in a column on the left. */
export function exportSvgMarkup(data: MapData): string {
  const mapArea = mapBounds(data);
  const legendX = mapArea.minX - LEGEND_WIDTH * LEGEND_SCALE - LEGEND_GAP;
  const bounds = { ...mapArea, minX: legendX - LEGEND_GAP };
  const legend = <Legend linkTypes={data.linkTypes} nodeTypes={data.nodeTypes} x={legendX} y={mapArea.minY + LEGEND_GAP} scale={LEGEND_SCALE} />;
  return `<?xml version="1.0" encoding="UTF-8"?>\n${renderToStaticMarkup(<ExportSvg data={data} bounds={bounds} legend={legend} />)}`;
}

export function downloadSvg(data: MapData, fileName: string) {
  download(new Blob([exportSvgMarkup(data)], { type: 'image/svg+xml' }), fileName);
}

/** Rasterises the exported SVG in the browser, so the server needs no image tooling. */
export async function downloadPng(data: MapData, fileName: string) {
  const markup = exportSvgMarkup(data);
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Nepodařilo se vytvořit PNG');
    download(blob, fileName);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
