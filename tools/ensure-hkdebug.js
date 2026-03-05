const mysql = require('mysql2/promise');
const crypto = require('crypto');

(async () => {
  const conn = await mysql.createConnection('mysql://root:@localhost:3306/rallylive');

  const [servers] = await conn.execute('SELECT id, slug, lastHeartbeatAt FROM FivemServer WHERE slug = ? LIMIT 1', ['hkc']);
  if (!servers[0]) { console.log('No server found with slug hkc'); await conn.end(); return; }
  const srv = servers[0];
  console.log('Server:', srv.id, '| Last heartbeat:', srv.lastHeartbeatAt);

  const cmdId = crypto.randomUUID();
  const now = new Date();
  await conn.execute(
    'INSERT INTO FivemPendingCommand (id, serverId, type, resources, reason, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [cmdId, srv.id, 'ENSURE', JSON.stringify(['HK-debug']), 'Restart HK-debug to apply updates', 'PENDING', now]
  );
  console.log('ENSURE command queued:', cmdId);
  console.log('Remote FiveM server will pick this up on next poll (within 15s)');

  await conn.end();
})().catch(e => { console.error(e.message); process.exit(1); });
