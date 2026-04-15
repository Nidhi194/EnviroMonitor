const { spawn } = require('node:child_process');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForHealthy(baseUrl, timeoutMs = 10_000) {
  const start = Date.now();
  while (true) {
    try {
      const res = await fetch(`${baseUrl}/api/health`, { redirect: 'manual' });
      if (res.ok) return;
    } catch {
      // ignore until timeout
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error('Server did not become healthy in time');
    }
    await sleep(250);
  }
}

async function main() {
  const port = Number(process.env.PORT || 3100);
  const baseUrl = `http://127.0.0.1:${port}`;

  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port) },
    stdio: 'inherit'
  });

  try {
    await waitForHealthy(baseUrl);

    const resRoot = await fetch(`${baseUrl}/`, { redirect: 'manual' });
    if (!resRoot.ok) {
      throw new Error(`GET / failed: ${resRoot.status}`);
    }

    const resHealth = await fetch(`${baseUrl}/api/health`, { redirect: 'manual' });
    if (!resHealth.ok) {
      throw new Error(`GET /api/health failed: ${resHealth.status}`);
    }

    console.log('✅ Smoke test passed');
  } finally {
    child.kill();
  }
}

main().catch((err) => {
  console.error('❌ Smoke test failed:', err?.message || err);
  process.exitCode = 1;
});

