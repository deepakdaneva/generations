// Wrapper around `firebase emulators:exec` that always stops the Firestore
// emulator afterwards. On Windows the Firebase CLI leaves its Java process
// running (port 8080 stays busy); the emulator's /shutdown endpoint stops it.
//
//   node scripts/emulators-exec.mjs <same arguments as firebase emulators:exec>

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Run the project's Firebase CLI with Node directly (no shell, so arguments stay intact).
const cli = fileURLToPath(new URL('../node_modules/firebase-tools/lib/bin/firebase.js', import.meta.url));
const child = spawn(process.execPath, [cli, 'emulators:exec', ...process.argv.slice(2)], {
  stdio: 'inherit',
});

// Ctrl+C reaches the Firebase CLI directly; wait for it to export and exit.
process.on('SIGINT', () => {});

child.on('exit', async (code) => {
  await fetch('http://127.0.0.1:8080/shutdown', { method: 'POST' }).catch(() => {});
  process.exit(code ?? 1);
});
