module.exports = {
  apps: [
    {
      name: 'sol-telegram-bot',
      cwd: __dirname,
      // Most reliable on Windows: call ts-node directly
      script: './node_modules/ts-node/dist/bin.js',
      args: 'src/index.ts',
      interpreter: 'node',
      exec_mode: 'fork',
      instances: 1,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      time: true,
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      },
      out_file: 'logs/out.log',
      error_file: 'logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
}
