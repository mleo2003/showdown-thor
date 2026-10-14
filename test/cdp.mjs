// cdp.mjs — evaluate JS in a Thor app's WebView over Chrome DevTools (debuggable WebViews only).
// Needs the WebView's DevTools socket forwarded first: adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>
// usage: node cdp.mjs '<expression>'  or  node cdp.mjs @file.js   (awaits promises; prints JSON)
const port = process.env.CDP_PORT || 9333;
const arg = process.argv[2] || 'document.title';
const expr = arg.startsWith('@') ? (await import('node:fs')).readFileSync(arg.slice(1), 'utf8') : arg;
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
// CDP_TARGET = URL prefix: the game (default) or the Thor info page (CDP_TARGET=file://)
const want = process.env.CDP_TARGET || 'https://localhost';
const page = targets.find(t => t.type === 'page' && t.url.startsWith(want)) || targets.find(t => t.type === 'page');
if (!page) { console.error('no debuggable page'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl.replace(/ws:\/\/[^/]+/, `ws://127.0.0.1:${port}`));
ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate',
  params: { expression: expr, awaitPromise: true, returnByValue: true } }));
let done = false;
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id !== 1) return;
  const r = m.result || {};
  if (r.exceptionDetails) console.log('EXCEPTION', JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  else console.log(typeof r.result?.value === 'string' ? r.result.value : JSON.stringify(r.result?.value ?? r.result, null, 1));
  done = true; ws.close();
};
ws.onclose = () => process.exit(0);
ws.onerror = e => { if (!done) console.error('ws error', e.message); process.exit(done ? 0 : 1); };
