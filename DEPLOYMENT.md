# Production Deployment Guide — cs.dashq.io

**Domain:** cs.dashq.io
**VPS:** DigitalOcean Ubuntu droplet (dashq-bridge)
**IP:** <VPS_IP>

---

## Architecture

```
Browser → cs.dashq.io (nginx :80/:443)
              ├── /static/*  → served directly by nginx
              ├── /api/*     → proxy to Flask :5000
              └── /*         → proxy to Flask :5000
```

- **Web server:** nginx (reverse proxy + static files)
- **App server:** Flask on port 5000 (systemd managed)
- **SSL:** Let's Encrypt via certbot
- **Auto-restart:** systemd (RestartSec=3)

---

## Prerequisites

- Ubuntu 24.04 VPS (dashq-bridge droplet)
- SSH access (root or sudo user)
- Domain cs.dashq.io already pointing to <VPS_IP>

---

## Initial Deployment (First Time)

### 1. SSH into VPS

```bash
ssh root@<VPS_IP>
```

### 2. Update system

```bash
sudo apt update && sudo apt upgrade -y
```

### 3. Install dependencies

```bash
sudo apt install -y nginx python3 python3-pip git certbot python3-certbot-nginx
```

### 4. Clone repository

```bash
sudo mkdir -p /var/www/csops-roadmap
cd /var/www
git clone https://github.com/zev-code/csops-roadmap-dashboard.git csops-roadmap
cd csops-roadmap
```

### 5. Create .env file (contains secrets - never commit)

```bash
cp .env.example .env
nano .env
```

Fill in real values:

```
ANTHROPIC_API_KEY=sk-ant-your-real-key
N8N_API_URL=https://your-n8n.com
N8N_API_KEY=your-real-key
FLASK_SECRET_KEY=your-generated-secret
GIT_AUTHOR_NAME=Zev
GIT_AUTHOR_EMAIL=zev@dashq.com
```

Generate a secret key:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### 6. Install Python dependencies

```bash
pip3 install -r requirements.txt --break-system-packages
```

### 7. Set permissions

```bash
sudo chown -R www-data:www-data /var/www/csops-roadmap
sudo chmod -R 755 /var/www/csops-roadmap
```

### 8. Configure nginx

```bash
sudo cp deploy/nginx-cs-dashq.conf /etc/nginx/sites-available/csops-roadmap
sudo ln -s /etc/nginx/sites-available/csops-roadmap /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

`nginx -t` should output: `syntax is ok, test is successful`

### 9. Configure systemd service

```bash
sudo cp deploy/csops-roadmap.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable csops-roadmap
sudo systemctl start csops-roadmap
```

### 10. Verify Flask is running

```bash
sudo systemctl status csops-roadmap
```

Should show: `Active: active (running)`

### 11. Test HTTP

Open browser: http://cs.dashq.io (should see dashboard)

### 12. Setup SSL (free via Let's Encrypt)

```bash
sudo certbot --nginx -d cs.dashq.io
```

Follow prompts:
- Enter email for renewal notices
- Agree to terms (Y)
- Share email with EFF (optional)
- Certbot auto-configures nginx for HTTPS

### 13. Test HTTPS

Open browser: https://cs.dashq.io (should see padlock)

---

## Update Process (Future Deployments)

### Method 1 — Deploy script (from local machine)

```bash
ssh root@<VPS_IP> "bash /var/www/csops-roadmap/deploy/deploy.sh"
```

### Method 2 — Manual

```bash
ssh root@<VPS_IP>
cd /var/www/csops-roadmap
git pull origin main
sudo systemctl restart csops-roadmap
exit
```

---

## Troubleshooting

### Check Flask logs

```bash
sudo journalctl -u csops-roadmap -f
```

### Check Flask service status

```bash
sudo systemctl status csops-roadmap
```

### Check nginx logs

```bash
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

### Restart all services

```bash
sudo systemctl restart csops-roadmap nginx
```

### Test nginx config

```bash
sudo nginx -t
```

### Check if port 5000 is running

```bash
sudo netstat -tlnp | grep 5000
```

### Check SSL certificate status

```bash
sudo certbot certificates
```

### Renew SSL manually (usually auto-renews)

```bash
sudo certbot renew
```

### Common Issues

| Issue | Fix |
|-------|-----|
| Port 5000 in use | `sudo netstat -tlnp \| grep 5000` — stop conflicting service |
| Permission denied | `sudo chown -R www-data:www-data /var/www/csops-roadmap` |
| Nginx won't start | `sudo nginx -t` — check for config errors |
| SSL fails | Ensure DNS propagated: `nslookup cs.dashq.io` |
| Dashboard 404 | Check Flask: `sudo systemctl status csops-roadmap` |
