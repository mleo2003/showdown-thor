// bot.mjs — test opponent "ThorBot" on the local Showdown server: accepts any challenge (or challenges $TARGET every
// few seconds), answers every request instantly with /choose default, and logs battle events with timestamps.
const NAME = process.env.BOT_NAME || 'ThorBot';
const TARGET = process.env.TARGET || '';
const ws = new WebSocket('ws://127.0.0.1:8000/showdown/websocket');
const t = () => new Date().toISOString().slice(11, 23);
let inBattle = false;
ws.onmessage = ev => {
  let room = '';
  for (const line of String(ev.data).split('\n')) {
    if (line.startsWith('>')) { room = line.slice(1); continue; }
    if (line.startsWith('|challstr|')) ws.send(`|/trn ${NAME},0,`);
    if (line.startsWith('|updateuser|')) console.log(t(), 'updateuser', line.split('|')[2]);
    if (line.startsWith('|updatechallenges|')) {
      const from = Object.keys(JSON.parse(line.slice(18)).challengesFrom || {});
      for (const u of from) { console.log(t(), 'accepting challenge from', u); ws.send(`|/accept ${u}`); }
    }
    if (line.startsWith('|pm|')) console.log(t(), 'pm', line.slice(0, 120));
    if (line.startsWith('|pm|') && line.includes('|/challenge')) {
      const from = line.split('|')[2].trim().replace(/^[^A-Za-z0-9]/, '');
      if (from.toLowerCase().replace(/[^a-z0-9]/g, '') !== NAME.toLowerCase()) {
        console.log(t(), 'accepting challenge from', from); ws.send(`|/accept ${from}`);
      }
    }
    if (room.startsWith('battle-')) {
      if (line.startsWith('|init|battle')) { inBattle = true; console.log(t(), 'battle started', room); }
      if (line.startsWith('|request|') && line.length > 9) {
        const req = JSON.parse(line.slice(9));
        if (!req.wait) { ws.send(`${room}|/choose default|${req.rqid}`); console.log(t(), 'chose default, rqid', req.rqid); }
      }
      if (/^\|(turn|faint|win|tie)\|/.test(line)) console.log(t(), line);
      if (line.startsWith('|win|') || line.startsWith('|tie')) inBattle = false;
    }
  }
};
ws.onopen = () => console.log(t(), 'connected');
ws.onclose = () => { console.log(t(), 'closed'); process.exit(0); };
if (TARGET) setInterval(() => { if (!inBattle) ws.send(`|/challenge ${TARGET}, gen9randombattle`); }, 5000);
