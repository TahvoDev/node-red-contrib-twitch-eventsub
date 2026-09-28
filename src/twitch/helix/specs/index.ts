import type { HelixSpec } from '../define';
import { userSpecs } from './users';
import { channelSpecs } from './channels';
import { chatSpecs } from './chat';
import { moderationSpecs } from './moderation';
import { contentSpecs } from './content';
import { monetisationSpecs } from './monetisation';
import { platformSpecs } from './platform';

/**
 * The Helix endpoint registry. Spec groups are spread in here; the single
 * `twitch-api` node looks an entry up by type. Adding an endpoint is a new
 * entry in a group file, nothing else.
 */
export const HELIX_SPECS: HelixSpec[] = [
  ...userSpecs,
  ...channelSpecs,
  ...chatSpecs,
  ...moderationSpecs,
  ...contentSpecs,
  ...monetisationSpecs,
  ...platformSpecs,
];

const seen = new Set<string>();
for (const spec of HELIX_SPECS) {
  if (seen.has(spec.type)) {
    throw new Error(`Duplicate Helix node type in the specs: ${spec.type}`);
  }
  seen.add(spec.type);
}
