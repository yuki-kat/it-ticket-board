#!/bin/bash
# Deploy Nginx + ModSecurity WAF for IT Ticket Board
# Run: sudo bash deploy-waf.sh

set -e

echo "================================"
echo "IT Ticket Board WAF Deployment"
echo "================================"
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "Error: This script must be run as root (use: sudo bash deploy-waf.sh)"
   exit 1
fi

# Step 1: Install packages
echo "[1/5] Installing Nginx and ModSecurity..."
apt-get update -qq
apt-get install -y -qq \
  nginx \
  libnginx-mod-http-modsecurity \
  modsecurity-crs \
  curl \
  > /dev/null 2>&1

echo "✓ Packages installed"

# Step 2: Create ModSecurity directories
echo "[2/5] Setting up ModSecurity directories..."
mkdir -p /var/tmp/modsecurity/
mkdir -p /var/log/modsecurity/
chown -R www-data:www-data /var/tmp/modsecurity/
chown -R www-data:www-data /var/log/modsecurity/
chmod 750 /var/tmp/modsecurity/
chmod 750 /var/log/modsecurity/
echo "✓ Directories created"

# Step 3: Deploy ModSecurity config
echo "[3/5] Deploying ModSecurity configuration..."
cp modsecurity.conf /etc/modsecurity/modsecurity.conf
chmod 644 /etc/modsecurity/modsecurity.conf
echo "✓ ModSecurity config deployed"

# Step 4: Deploy Nginx config
echo "[4/5] Deploying Nginx configuration..."
cp nginx-modsecurity.conf /etc/nginx/sites-available/it-ticket-board
chmod 644 /etc/nginx/sites-available/it-ticket-board

# Remove default site if it exists
rm -f /etc/nginx/sites-enabled/default

# Enable the IT Ticket Board site
ln -sf /etc/nginx/sites-available/it-ticket-board /etc/nginx/sites-enabled/it-ticket-board

echo "✓ Nginx config deployed"

# Step 5: Test and start
echo "[5/5] Testing and starting Nginx..."
if nginx -t > /dev/null 2>&1; then
  systemctl restart nginx
  systemctl enable nginx
  echo "✓ Nginx started and enabled"
else
  echo "✗ Nginx config test failed. Run: sudo nginx -t"
  exit 1
fi

echo ""
echo "================================"
echo "✓ WAF Deployment Complete!"
echo "================================"
echo ""
echo "Configuration:"
echo "  Nginx config:     /etc/nginx/sites-available/it-ticket-board"
echo "  ModSecurity conf: /etc/modsecurity/modsecurity.conf"
echo "  OWASP CRS rules:  /usr/share/modsecurity-crs/rules/"
echo ""
echo "Logs:"
echo "  Access log:  /var/log/nginx/it-ticket-board-access.log"
echo "  Error log:   /var/log/nginx/it-ticket-board-error.log"
echo "  Audit log:   /var/log/modsecurity/audit.log (ModSecurity blocks)"
echo ""
echo "Monitor WAF blocks (live):"
echo "  sudo tail -f /var/log/modsecurity/audit.log | grep 'action.*blocked'"
echo ""
echo "Next steps:"
echo "  1. Verify Node app is running on localhost:3000"
echo "  2. Test: curl http://localhost"
echo "  3. Monitor logs for 48 hours"
echo "  4. Adjust paranoia level if needed in /etc/modsecurity/modsecurity.conf"
echo ""
