import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // `host: true` binds every interface so a phone / tablet on the same Wi-Fi can
  // reach the dev server and the `vite preview` prod build (backlog L3.4.1 —
  // real-device pass). `npm run dev:lan` at the repo root also plumbs the LAN IP
  // into `VITE_API_URL` so the API is reachable from the device.
  server: { host: true },
  preview: { host: true },
});
