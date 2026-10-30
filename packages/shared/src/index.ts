import { z } from 'zod';

export const nodeShapes = ['cloud', 'ellipse', 'point'] as const;
export const linkShapes = ['straight', 'arc', 'bezier', 'polyline'] as const;
export const labelAligns = ['left', 'center', 'right'] as const;

const id = z.string().min(1);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const linkTypeSchema = z.object({
  id,
  name: z.string().min(1),
  color,
  width: z.number().positive(),
  dash: z.string(),
  description: z.string(),
  sortOrder: z.number().int(),
  /**
   * Leased connectivity between two distant sites (outside hkfree infrastructure).
   * Such links are drawn only as short stubs at both ends instead of a line across the map.
   * A link of this type may also lead out of the map, see `MapLink.toNodeId`.
   */
  remote: z.boolean().default(false),
});

export const nodeTypeSchema = z.object({
  id,
  name: z.string().min(1),
  shape: z.enum(nodeShapes),
  fillColor: color.nullable(),
  strokeColor: color,
  isArea: z.boolean(),
  description: z.string(),
  sortOrder: z.number().int(),
});

export const pointSchema = z.object({ x: z.number(), y: z.number() });

export const mapNodeSchema = z.object({
  id,
  typeId: id,
  label: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  fontSize: z.number().positive(),
  /** Offset of the label centre from the node centre. */
  labelDx: z.number(),
  labelDy: z.number(),
  note: z.string(),
});

export const mapLinkSchema = z.object({
  id,
  typeId: id,
  fromNodeId: id,
  /** Null for an external uplink of a remote type: connectivity to a provider outside the map. */
  toNodeId: id.nullable(),
  shape: z.enum(linkShapes),
  /** Arc bulge as a fraction of the chord length, positive = left of the from→to direction. */
  curvature: z.number(),
  /**
   * Bezier control points or polyline vertices between the two endpoints.
   * For links of a remote type: the outer ends of the from and to stubs,
   * for an external uplink the outer end of its single stub.
   */
  points: z.array(pointSchema),
  /** Rounding of polyline corners in px. */
  cornerRadius: z.number().nonnegative().default(0),
  /** Throughput, e.g. "250Mbps". */
  capacity: z.string(),
  /** Provider at the far end of an external uplink, e.g. "CETIN". */
  peer: z.string().default(''),
  labelX: z.number().nullable(),
  labelY: z.number().nullable(),
  note: z.string(),
});

export const mapLabelSchema = z.object({
  id,
  text: z.string(),
  x: z.number(),
  y: z.number(),
  fontSize: z.number().positive(),
  bold: z.boolean(),
  color,
  /** x is the anchor according to align, y is the vertical centre of the text block. */
  align: z.enum(labelAligns),
});

export const revisionSchema = z.object({
  id: z.number().int(),
  createdAt: z.string(),
  author: z.string(),
  message: z.string(),
});

export const mapDataSchema = z.object({
  revision: revisionSchema.nullable(),
  linkTypes: z.array(linkTypeSchema),
  nodeTypes: z.array(nodeTypeSchema),
  nodes: z.array(mapNodeSchema),
  links: z.array(mapLinkSchema),
  labels: z.array(mapLabelSchema),
});

const changeCountsSchema = z.object({
  added: z.number().int(),
  changed: z.number().int(),
  deleted: z.number().int(),
});

export const revisionSummarySchema = revisionSchema.extend({
  changes: z.object({
    linkTypes: changeCountsSchema,
    nodeTypes: changeCountsSchema,
    nodes: changeCountsSchema,
    links: changeCountsSchema,
    labels: changeCountsSchema,
  }),
});

export const mapCollections = ['linkTypes', 'nodeTypes', 'nodes', 'links', 'labels'] as const;

const ids = z.array(id).default([]);

export const mapChangesSchema = z.object({
  upsert: z
    .object({
      linkTypes: z.array(linkTypeSchema).default([]),
      nodeTypes: z.array(nodeTypeSchema).default([]),
      nodes: z.array(mapNodeSchema).default([]),
      links: z.array(mapLinkSchema).default([]),
      labels: z.array(mapLabelSchema).default([]),
    })
    .prefault({}),
  delete: z
    .object({ linkTypes: ids, nodeTypes: ids, nodes: ids, links: ids, labels: ids })
    .prefault({}),
});

export const saveChangesSchema = mapChangesSchema.extend({
  /** Revision the client started editing from; saving fails if the map changed since. */
  baseRevisionId: z.number().int().nullable(),
  message: z.string().max(500).default(''),
});

export const restoreRevisionSchema = z.object({
  message: z.string().max(500).default(''),
});

export const userSchema = z.object({
  /** UserDB id from the hkfree SSO, "dev" in dev mode or "api:<name>" for API keys. */
  id: z.string(),
  name: z.string(),
});

export const currentUserSchema = z.object({
  user: userSchema,
  /** Login is disabled and every change is recorded as made by "dev". */
  devMode: z.boolean(),
});

export const metaSchema = z.object({
  name: z.string(),
  version: z.string(),
});

export type NodeShape = (typeof nodeShapes)[number];
export type LinkShape = (typeof linkShapes)[number];
export type LabelAlign = (typeof labelAligns)[number];
export type LinkType = z.infer<typeof linkTypeSchema>;
export type NodeType = z.infer<typeof nodeTypeSchema>;
export type Point = z.infer<typeof pointSchema>;
export type MapNode = z.infer<typeof mapNodeSchema>;
export type MapLink = z.infer<typeof mapLinkSchema>;
export type MapLabel = z.infer<typeof mapLabelSchema>;
export type Revision = z.infer<typeof revisionSchema>;
export type MapData = z.infer<typeof mapDataSchema>;
export type Meta = z.infer<typeof metaSchema>;
export type ChangeCounts = z.infer<typeof changeCountsSchema>;
export type RevisionSummary = z.infer<typeof revisionSummarySchema>;
export type MapCollection = (typeof mapCollections)[number];
export type MapChanges = z.infer<typeof mapChangesSchema>;
export type SaveChanges = z.input<typeof saveChangesSchema>;
export type User = z.infer<typeof userSchema>;
export type CurrentUser = z.infer<typeof currentUserSchema>;

export { isExternalLink, linkNodeIds } from './links';
export { diffMaps, countChanges } from './diff';
export { assignReadableIds, isTemporaryId, slugify, temporaryId, uniqueId } from './ids';
export { CORE_NODE_ID, checkTopology, hasTopologyProblems, linkedNodeIds, type TopologyProblems } from './topology';
