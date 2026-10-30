import type { MapLink } from './index';

export const isExternalLink = (link: MapLink) => link.toNodeId === null;

/** Ids of the nodes at the ends of a link; an external uplink has only one. */
export const linkNodeIds = (link: MapLink): string[] => (link.toNodeId === null ? [link.fromNodeId] : [link.fromNodeId, link.toNodeId]);
