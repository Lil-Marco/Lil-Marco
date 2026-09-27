// Design Brief §07 / Engineering Plan T23: fail on any raw hex colour outside the tokens file.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ALLOWED = new Set([join('src', 'ui', 'tokens.ts')]);
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const offenders = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(p) && !ALLOWED.has(p)) {
      readFileSync(p, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const hits = line.match(HEX);
          if (hits) offenders.push(`${p}:${i + 1}  ${hits.join(', ')}`);
        });
    }
  }
}

walk('src');
if (offenders.length) {
  console.error('Raw hex colours outside src/ui/tokens.ts:\n' + offenders.join('\n'));
  process.exit(1);
}
console.log('tokens: ok — no raw hex outside src/ui/tokens.ts');
