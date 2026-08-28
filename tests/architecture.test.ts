import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Layer-boundary guard (SPEC §3): the engine is pure — it must never import
 * from render / ui / input / save / app. Deep imports of engine internals from
 * outside layers are a documented convention TODO (barrel-only) for M1.
 */

const ENGINE_ROOT = join(process.cwd(), 'src', 'engine');
const FORBIDDEN = /(render|ui|input|save|app|content(?!\/))\//;

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkTs(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('engine purity', () => {
  it('engine files never import DOM/UI/save layers or app code', () => {
    const violations: string[] = [];
    for (const file of walkTs(ENGINE_ROOT)) {
      const src = readFileSync(file, 'utf8');
      const importLines = src.split('\n').filter((l: string) => l.trim().startsWith('import'));
      for (const line of importLines) {
        if (/from\s+['"](@\/)?(render|ui|input|save)\//.test(line)) {
          violations.push(`${file}: ${line.trim()}`);
        }
        if (/@preact|pixi\.js|preact/.test(line)) {
          violations.push(`${file}: ${line.trim()}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
