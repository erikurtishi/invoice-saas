/**
 * dev:lan — run the API + web dev servers bound to every interface, with the
 * machine's LAN IP plumbed into `VITE_API_URL` so a phone / tablet on the same
 * Wi-Fi can drive the real app (backlog L3.4.1 — real-device pass).
 *
 *   npm run dev:lan
 *
 * Then open the printed http://<lan-ip>:5173 on the device. For a stable https
 * origin (some flows prefer it), run a tunnel instead — see docs/device-testing.md.
 * Stop with Ctrl-C; both children are killed together.
 */
import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';

function lanIPv4() {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return null;
}

const ip = lanIPv4();
if (!ip) {
  console.error('No non-internal IPv4 interface found — are you on a network?');
  process.exit(1);
}

const WEB_PORT = 5173;
const API_PORT = 4000;
const webUrl = `http://${ip}:${WEB_PORT}`;
const apiUrl = `http://${ip}:${API_PORT}`;

console.log(
  `\n  LAN dev servers\n  ───────────────\n  On this device:  http://localhost:${WEB_PORT}\n  On your phone:   ${webUrl}\n  API:             ${apiUrl}\n\n  (device + this machine must share the Wi-Fi; allow Node through the firewall if prompted)\n`,
);

const children = [
  spawn('npm', ['run', 'dev:api'], {
    stdio: 'inherit',
    env: { ...process.env, WEB_ORIGIN: webUrl },
  }),
  spawn('npm', ['run', 'dev', '-w', '@invoice-saas/web'], {
    stdio: 'inherit',
    env: { ...process.env, VITE_API_URL: apiUrl },
  }),
];

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill('SIGINT');
  process.exit(code ?? 0);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
for (const c of children) c.on('exit', (code) => stop(code ?? 0));
