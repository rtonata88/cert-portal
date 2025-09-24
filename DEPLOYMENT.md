# Deployment Instructions for cert-portal

This guide provides instructions for deploying the cert-portal application on a Linux production server with nginx.

## Prerequisites
- Linux server (Ubuntu/CentOS/Debian)
- Node.js installed (v14 or higher)
- nginx installed
- User account with sudo privileges

## Deployment Options

You have two options for running the Node.js application:
1. **PM2** (Recommended) - Process manager with monitoring
2. **Systemd** - Native Linux service management

---

## Option 1: Deployment with PM2

### Step 1: Prepare the Server

```bash
# Create application directory
sudo mkdir -p /var/www/cert-portal
sudo chown -R $USER:$USER /var/www/cert-portal

# Create logs directory
mkdir -p /var/www/cert-portal/logs
```

### Step 2: Upload Project Files

```bash
# From your local machine, upload files to server
rsync -avz --exclude 'node_modules' --exclude '.git' \
  ./ user@your-server:/var/www/cert-portal/

# Or use git clone if using version control
cd /var/www/cert-portal
git clone your-repository-url .
```

### Step 3: Install Dependencies

```bash
cd /var/www/cert-portal
npm install --production
```

### Step 4: Set Up Environment Variables

```bash
# Create .env file for production settings
cat > /var/www/cert-portal/.env << EOF
NODE_ENV=production
PORT=3000
SESSION_SECRET=your-strong-secret-here
COMPANY_WEBSITE=https://www.unam.edu.na/
EOF
```

### Step 5: Start Application with PM2

```bash
# Install PM2 as dev dependency (already in package.json)
npm install

# Start the application
npm run pm2:start

# Check status
npm run pm2:status

# View logs
npm run pm2:logs

# Set PM2 to start on boot (optional, requires global PM2)
# sudo npm install -g pm2
# pm2 startup systemd
# pm2 save
```

---

## Option 2: Deployment with Systemd

### Step 1-4: Same as PM2 Option

Follow steps 1-4 from the PM2 deployment section above.

### Step 5: Install Systemd Service

```bash
# Copy service file
sudo cp cert-portal.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable cert-portal

# Start the service
sudo systemctl start cert-portal

# Check status
sudo systemctl status cert-portal

# View logs
sudo journalctl -u cert-portal -f
```

---

## Configure Nginx

### Step 1: Copy Nginx Configuration

```bash
# Copy nginx configuration
sudo cp nginx.conf /etc/nginx/sites-available/cert-portal

# Create symbolic link
sudo ln -s /etc/nginx/sites-available/cert-portal /etc/nginx/sites-enabled/
```

### Step 2: Update Configuration

Edit `/etc/nginx/sites-available/cert-portal` and update:
- `server_name` with your domain or IP address
- SSL certificate paths if using HTTPS
- Adjust paths if your app is in a different location

```bash
sudo nano /etc/nginx/sites-available/cert-portal
```

### Step 3: Test and Reload Nginx

```bash
# Test configuration
sudo nginx -t

# If test passes, reload nginx
sudo systemctl reload nginx
```

---

## File Permissions

Ensure proper permissions for the application:

```bash
# Set ownership
sudo chown -R $USER:$USER /var/www/cert-portal

# Set permissions for database and certificates
chmod 664 /var/www/cert-portal/database.db
chmod 755 /var/www/cert-portal/certificates

# If using systemd, ensure the service user can write to these directories
sudo chown -R sysadmin:sysadmin /var/www/cert-portal
```

---

## Firewall Configuration

```bash
# Allow HTTP
sudo ufw allow 80/tcp

# Allow HTTPS (if using SSL)
sudo ufw allow 443/tcp

# Allow SSH (if not already allowed)
sudo ufw allow 22/tcp

# Enable firewall
sudo ufw enable
```

---

## SSL/TLS Setup (Optional but Recommended)

### Using Let's Encrypt

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is set up automatically
```

---

## Monitoring and Maintenance

### PM2 Commands
```bash
npm run pm2:status    # Check status
npm run pm2:logs      # View logs
npm run pm2:restart   # Restart application
npm run pm2:reload    # Zero-downtime reload
npm run pm2:stop      # Stop application
```

### Systemd Commands
```bash
sudo systemctl status cert-portal     # Check status
sudo systemctl restart cert-portal    # Restart
sudo systemctl stop cert-portal       # Stop
sudo systemctl start cert-portal      # Start
sudo journalctl -u cert-portal -f     # View logs
```

### Database Backup
```bash
# Create backup
cp /var/www/cert-portal/database.db /backup/database_$(date +%Y%m%d).db

# Set up cron job for automatic backups
crontab -e
# Add: 0 2 * * * cp /var/www/cert-portal/database.db /backup/database_$(date +\%Y\%m\%d).db
```

---

## Troubleshooting

### Application not accessible
1. Check Node.js app is running: `npm run pm2:status` or `systemctl status cert-portal`
2. Check nginx is running: `systemctl status nginx`
3. Check firewall: `sudo ufw status`
4. Check nginx error logs: `sudo tail -f /var/log/nginx/cert-portal.error.log`
5. Check app logs: `npm run pm2:logs` or `journalctl -u cert-portal`

### Permission errors
- Ensure the application user has write access to database.db and certificates/
- Check file ownership: `ls -la /var/www/cert-portal/`

### Port already in use
- Check what's using port 3000: `sudo lsof -i :3000`
- Kill the process or change PORT in environment variables

---

## Security Considerations

1. **Change default secrets**: Update SESSION_SECRET in production
2. **Use HTTPS**: Enable SSL/TLS with Let's Encrypt or your certificate
3. **Firewall**: Only open necessary ports
4. **Updates**: Keep Node.js, nginx, and system packages updated
5. **Monitoring**: Set up monitoring and alerts for downtime
6. **Backups**: Regular database backups

---

## Quick Deployment Checklist

- [ ] Server has Node.js installed
- [ ] nginx installed and configured
- [ ] Application files uploaded to /var/www/cert-portal
- [ ] Dependencies installed with `npm install`
- [ ] Environment variables configured
- [ ] PM2 or systemd service started
- [ ] nginx configuration in place and tested
- [ ] Firewall rules configured
- [ ] SSL certificate installed (optional)
- [ ] Application accessible via browser
- [ ] Database writable
- [ ] Certificate uploads working