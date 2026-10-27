/** Reseeds the web API instance (expenso_web on 4101) so every run starts from the same data. */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { API } from './helpers';

export default async function globalSetup() {
  if (process.env.E2E_SKIP_SEED === '1') return;
  const server = fileURLToPath(new URL('../../server', import.meta.url));
  execSync('./scripts/instance.sh web 4101 seed', { cwd: server, stdio: 'inherit', timeout: 180_000 });
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`${API}/health`)).ok) return; } catch { /* starting */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('The API on 4101 did not come back after seeding');
}
