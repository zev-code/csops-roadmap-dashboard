#!/bin/bash
set -e

echo "=== Deploying CS Ops Roadmap Dashboard ==="
cd /var/www/csops-roadmap

echo "Pulling latest changes..."
git pull origin main

echo "Restarting Flask service..."
sudo systemctl restart csops-roadmap

echo "Service status:"
sudo systemctl status csops-roadmap --no-pager

echo "=== Deploy complete ==="
