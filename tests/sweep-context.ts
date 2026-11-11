import type { Params, Scene } from '../src/core/types';

/**
 * Parameters a control depends on (`visibleIf`): the smallest change of select / toggle params from
 * `base` that makes `key` visible, so a sweep of `key` exercises the mode it belongs to.
 */
export function contextFor(scene: Scene, key: string, base: Params): Params {
  const vis = scene.params[key].visibleIf;
  if (!vis || vis(base)) return {};
  const alts: [string, Params[string]][] = [];
  for (const [k, sp] of Object.entries(scene.params)) {
    if (k === key) continue;
    if (sp.kind === 'select') for (const o of sp.options) if (o.value !== base[k]) alts.push([k, o.value]);
    if (sp.kind === 'toggle') alts.push([k, !base[k]]);
  }
  for (const [k, v] of alts) if (vis({ ...base, [k]: v })) return { [k]: v };
  for (const [k1, v1] of alts) for (const [k2, v2] of alts) if (k1 !== k2 && vis({ ...base, [k1]: v1, [k2]: v2 })) return { [k1]: v1, [k2]: v2 };
  return {};
}
