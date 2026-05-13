module.exports = {
  apps: [
    {
      name: 'underbid-orchestrator',
      script: 'src/core/orchestrator.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx/esm',
      cwd: '/home/user/OperationUnderbid',
      watch: false,
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 999999,
      min_uptime: '10s',
      env: {
        NODE_ENV: 'production',
        HEADLESS: 'true',
      },
      log_file: './logs/pm2-combined.log',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
    {
      name: 'underbid-watchdog',
      script: 'node',
      args: '-e "require(\'http\').get(\'http://127.0.0.1:9999/healthcheck\', r => { let d=\'\'; r.on(\'data\',c=>d+=c); r.on(\'end\',()=>{ const h=JSON.parse(d); if(!h.healthy){process.stderr.write(\'UNHEALTHY: \'+d); process.exit(1);} }); }).on(\'error\',e=>{process.stderr.write(e.message); process.exit(1);})"',
      cron_restart: '*/3 * * * *',
      watch: false,
      autorestart: false,
    },
  ],
};
