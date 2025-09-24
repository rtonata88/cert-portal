module.exports = {
  apps: [{
    name: 'cert-portal',
    script: './server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      SESSION_SECRET: process.env.SESSION_SECRET || 'cert-portal-secret-key',
      COMPANY_WEBSITE: process.env.COMPANY_WEBSITE || 'https://www.unam.edu.na/'
    },
    env_development: {
      NODE_ENV: 'development',
      PORT: 3000,
      SESSION_SECRET: 'dev-secret-key',
      COMPANY_WEBSITE: 'https://www.unam.edu.na/'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};