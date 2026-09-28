import type { HelixSpec } from '../define';
import { userSpecs } from './users';

/**
 * Every declarative Helix node. Spec groups are spread in here; the factory
 * looks a spec up by type and the build generates one palette entry per spec.
 * Adding an endpoint is a new entry in a group file, nothing else.
 */
export const HELIX_SPECS: HelixSpec[] = [...userSpecs];

const seen = new Set<string>();
for (const spec of HELIX_SPECS) {
  if (seen.has(spec.type)) {
    throw new Error(`Duplicate Helix node type in the specs: ${spec.type}`);
  }
  seen.add(spec.type);
}
