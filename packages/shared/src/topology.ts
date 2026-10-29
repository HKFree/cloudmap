import type { MapData } from './index';

/** The central site every part of the network has to reach; it cannot be deleted. */
export const CORE_NODE_ID = '4-pmv-igw';

export interface TopologyProblems {
  /** Links with an end that is not attached to anything (a point used by no other link). */
  looseLinks: string[];
  /** Linked nodes with no path to the core node. Empty when the core node is missing. */
  unreachableNodes: string[];
  coreMissing: boolean;
}

type TopologyInput = Pick<MapData, 'nodeTypes' | 'nodes' | 'links'>;

/** Ids of nodes that have at least one link. */
export function linkedNodeIds(map: Pick<MapData, 'links'>): Set<string> {
  return new Set(map.links.flatMap((l) => [l.fromNodeId, l.toNodeId]));
}

/**
 * Checks loose links and reachability of the core. Only nodes with links are expected to
 * reach the core; `previouslyLinked` adds nodes that had links before an edit, so a site
 * whose last link was deleted is reported too.
 */
export function checkTopology(map: TopologyInput, previouslyLinked: ReadonlySet<string> = new Set()): TopologyProblems {
  const pointTypes = new Set(map.nodeTypes.filter((t) => t.shape === 'point').map((t) => t.id));
  const pointNodes = new Set(map.nodes.filter((n) => pointTypes.has(n.typeId)).map((n) => n.id));

  const neighbours = new Map<string, string[]>();
  const connect = (a: string, b: string) => neighbours.set(a, [...(neighbours.get(a) ?? []), b]);
  for (const link of map.links) {
    connect(link.fromNodeId, link.toNodeId);
    connect(link.toNodeId, link.fromNodeId);
  }

  const isLooseEnd = (id: string) => pointNodes.has(id) && (neighbours.get(id)?.length ?? 0) <= 1;
  const looseLinks = map.links.filter((l) => isLooseEnd(l.fromNodeId) || isLooseEnd(l.toNodeId)).map((l) => l.id);

  const coreMissing = !map.nodes.some((n) => n.id === CORE_NODE_ID);
  if (coreMissing) return { looseLinks, unreachableNodes: [], coreMissing };

  const reached = new Set([CORE_NODE_ID]);
  const queue = [CORE_NODE_ID];
  while (queue.length) {
    for (const next of neighbours.get(queue.pop()!) ?? []) {
      if (reached.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }
  const unreachableNodes = map.nodes
    .filter((n) => !pointNodes.has(n.id) && (neighbours.has(n.id) || previouslyLinked.has(n.id)) && !reached.has(n.id))
    .map((n) => n.id);

  return { looseLinks, unreachableNodes, coreMissing };
}

export const hasTopologyProblems = (p: TopologyProblems) => p.coreMissing || p.looseLinks.length > 0 || p.unreachableNodes.length > 0;
