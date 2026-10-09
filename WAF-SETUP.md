# WAF (Web Application Firewall) Setup

Application-layer protection for IT Ticket Board using Nginx + ModSecurity + OWASP CRS.

## What it protects against

- **SQL Injection**: `SELECT * FROM users WHERE id = '1' OR '1'='1`
- **XSS (Cross-Site Scripting)**: `<script>alert('hacked')</script>`
- **Command Injection**: `; rm -rf /`
- **Path Traversal**: `../../etc/passwd`
- **Known CVE exploits**: Blocks signatures in OWASP Core Rule Set
- **Brute force**: Rate limiting on auth endpoints

## Quick Start

**On your server:**

```bash
cd /path/to/it-ticket-board
sudo bash deploy-waf.sh
```

This will:
1. ✓ Install Nginx + ModSecurity + OWASP CRS
2. ✓ Deploy configurations
3. ✓ Start Nginx (listens on port 80)
4. ✓ Proxy traffic to Node app (localhost:3000)

**Verify it's working:**

```bash
# Check Nginx status
sudo systemctl status nginx

# Test WAF is blocking SQL injection
curl "http://localhost/?id=1' OR '1'='1"

# Check logs
sudo tail -f /var/log/modsecurity/audit.log
```

## Architecture

```
┌─────────────┐
│   Internet  │
└──────┬──────┘
       │ (port 80)
       ▼
┌─────────────────────┐
│  Nginx (Reverse     │  ← You are here
│  Proxy + WAF)       │  - ModSecurity
└──────┬──────────────┘  - OWASP CRS rules
       │                 - Rate limiting
       │ (localhost:3000)
       ▼
┌─────────────────────┐
│  Node.js App        │
│  (IT Ticket Board)  │
└─────────────────────┘
       │
       ▼
┌─────────────────────┐
│  PostgreSQL DB      │
└─────────────────────┘
```

## Configuration Files

### `nginx-modsecurity.conf`
Main Nginx configuration. Sets up:
- ModSecurity WAF engine
- Security headers (CSP, X-Frame-Options, etc.)
- Proxy settings for Node app
- Blocks access to `.git`, `node_modules`, hidden files

### `modsecurity.conf`
ModSecurity rules engine:
- Rule mode: `On` (blocking) or `DetectionOnly` (logging only)
- Paranoia level: 1 (default) to 4 (strict)
- Request/response size limits
- OWASP CRS rule set
- Custom app-specific rules

## Monitoring

**Watch for blocks in real-time:**

```bash
sudo tail -f /var/log/modsecurity/audit.log | grep -i "action.*denied"
```

**Check a specific day's blocks:**

```bash
sudo grep "2024-01-15" /var/log/modsecurity/audit.log | grep "denied" | wc -l
```

**Analyze attack patterns:**

```bash
# Most common blocked rules
sudo grep "id:" /var/log/modsecurity/audit.log | grep -oP 'id:\K[0-9]+' | sort | uniq -c | sort -rn | head -10

# Source IPs making requests
sudo grep "src_ip:" /var/log/modsecurity/audit.log | grep -oP 'src_ip:\K[0-9.]+' | sort | uniq -c | sort -rn
```

## Tuning

### If you get false positives:

1. **Identify the rule** in audit.log
2. **Lower paranoia level** in `/etc/modsecurity/modsecurity.conf`:
   ```
   SecCRSsetParanoidaLevel 1  # Try 1 instead of 2
   ```
3. **Or whitelist the rule** for specific URIs:
   ```
   SecRule REQUEST_URI "@beginsWith /api/escalation/upload" \
       "id:1001,phase:1,pass,nolog,ctl:RuleEngine=Off"
   ```
4. **Reload Nginx**: `sudo systemctl reload nginx`

### If you're getting blocked legitimate traffic:

**Run in detection-only mode first:**

```bash
# Temporarily log instead of block
sudo sed -i 's/SecRuleEngine On/SecRuleEngine DetectionOnly/' /etc/modsecurity/modsecurity.conf
sudo systemctl reload nginx

# Monitor for 24 hours
tail -f /var/log/modsecurity/audit.log

# Once comfortable, re-enable blocking
sudo sed -i 's/SecRuleEngine DetectionOnly/SecRuleEngine On/' /etc/modsecurity/modsecurity.conf
sudo systemctl reload nginx
```

## Testing

### Verify WAF is active:

```bash
# This should be blocked (SQL injection)
curl "http://localhost/?test=' OR '1'='1"

# Check logs show it was blocked
sudo tail -5 /var/log/modsecurity/audit.log
```

### Test specific rules:

```bash
# XSS attempt
curl "http://localhost/?q=<script>alert(1)</script>"

# Path traversal
curl "http://localhost/../../etc/passwd"

# Large payload (request body limit)
curl -X POST http://localhost/api -d "$(head -c 20M </dev/zero)"
```

## Performance Impact

- **Latency**: ~1-5ms per request (negligible)
- **CPU**: ~2-5% overhead
- **Memory**: ~50-100MB for ModSecurity engine

Monitor with: `sudo htop` or check Nginx stats

## Troubleshooting

**Nginx won't start:**
```bash
sudo nginx -t  # Check syntax errors
sudo systemctl status nginx  # Check service status
```

**ModSecurity not loading:**
```bash
# Verify module is installed
nginx -V 2>&1 | grep modsecurity

# Check permissions
ls -la /etc/modsecurity/
```

**False positives too high:**
```bash
# Lower paranoia level (1-4)
sudo nano /etc/modsecurity/modsecurity.conf
# Change: SecCRSsetParanoidaLevel 2 → SecCRSsetParanoidaLevel 1
sudo systemctl reload nginx
```

## Logging locations

```
/var/log/nginx/it-ticket-board-access.log    # All HTTP requests
/var/log/nginx/it-ticket-board-error.log     # Nginx errors
/var/log/modsecurity/audit.log               # WAF rule matches (JSON)
```

## Next Steps

1. **Deploy**: Run `sudo bash deploy-waf.sh`
2. **Monitor**: Watch logs for 48 hours in detection mode
3. **Tune**: Adjust paranoia level based on false positives
4. **Enable blocking**: Switch to `SecRuleEngine On` once stable
5. **Update rules**: Periodically update OWASP CRS: `sudo apt upgrade modsecurity-crs`

---

**For more info:**
- ModSecurity: https://modsecurity.org
- OWASP CRS: https://coreruleset.org
- Nginx docs: https://nginx.org/en/docs
