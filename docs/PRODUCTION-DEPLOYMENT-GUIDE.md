# 🚀 Production Deployment Guide - Real Scenario

## Day Before Deployment - Preparation Checklist

You're at the head admin office. Tomorrow you'll deploy this to production. Let's make sure everything works!

---

## ⚠️ Critical Pre-Flight Checks

### 1. **Test on Your Local Machine First** (Today!)

Before touching production, verify everything works locally:

```bash
# 1. Check server starts without errors
npm start

# Expected output:
✓ Network Management Suite v2.0.0 started successfully
✓ Server running at http://localhost:9090
✓ WebSocket server ready for real-time monitoring
✓ Enterprise monitoring system ACTIVATED
  - Auto-monitoring: every 60s
  - Email alerts: ENABLED/DISABLED
  - Webhook alerts: ENABLED/DISABLED
  - Real-time updates: ENABLED (WebSocket)
```

**If you see errors:**
- Database connection failed → Fix DATABASE_URL in .env
- Module not found → Run `npm install`
- Port in use → Change PORT in .env

### 2. **Test Database Connection**

```bash
# Check PostgreSQL is running
psql -h localhost -U postgres -d Network_management_suite -c "SELECT 1"

# Should return:
 ?column? 
----------
        1
```

**If fails:**
- PostgreSQL not running → Start service
- Wrong credentials → Fix .env DATABASE_URL
- Database doesn't exist → Create it

### 3. **Test Core Features**

Open http://localhost:9090 and test:

- [ ] Dashboard loads
- [ ] Add a room (Infrastructure tab)
- [ ] Add a device (IP & VLAN tab)
- [ ] Enable monitoring on device
- [ ] Check "Live" indicator appears (top-right)
- [ ] See device in monitoring tab
- [ ] Click "Check all" - should get results

**If any fail → Fix before deployment!**

### 4. **Test Monitoring System**

```bash
# Check logs for monitoring activity
tail -f logs/application-$(date +%Y-%m-%d).log
```

You should see:
```
INFO: Checking 1 monitored devices...
INFO: Monitoring cycle complete: 1 up, 0 down (1234ms)
```

### 5. **Test Email Alerts (Critical!)**

**Option A: Use Gmail (Easiest)**

```env
# .env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-admin@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx  # App password from Google
SMTP_FROM=Network Alerts <alerts@youroffice.com>
ALERT_EMAIL=your-admin@gmail.com
```

**To get Gmail App Password:**
1. Go to https://myaccount.google.com/apppasswords
2. Select "Mail" and "Other (Custom name)"
3. Type "Network Monitoring"
4. Click "Generate"
5. Copy 16-character password (spaces removed)

**Test it:**
1. Restart server
2. Check logs: `Email alerts configured (smtp.gmail.com:587)`
3. Monitor a device
4. Unplug it
5. Wait 3 minutes
6. Check your email!

**Option B: Use Office SMTP Server**

```env
SMTP_HOST=mail.youroffice.local
SMTP_PORT=25
SMTP_SECURE=false
SMTP_USER=monitoring@youroffice.local
SMTP_PASS=password
ALERT_EMAIL=admin@youroffice.local
```

**Test with telnet:**
```bash
telnet mail.youroffice.local 25
# Should connect
```

---

## 🏢 Deployment Day - Real Scenario

### **Scenario: Head Admin Office - 8:00 AM**

You arrive at office with:
- Laptop with the application
- Access to server room
- PostgreSQL database server ready
- Network switch access (for monitoring)

---

## Step 1: Prepare Production Server (30 minutes)

### **Option A: Windows Server**

```powershell
# 1. Install Node.js (if not installed)
# Download from https://nodejs.org (LTS version)
node --version  # Should show v22+

# 2. Install PostgreSQL (if not installed)
# Download from https://www.postgresql.org/download/windows/

# 3. Create project directory
mkdir C:\NetworkMonitoring
cd C:\NetworkMonitoring

# 4. Copy your project files
# Use USB, network share, or git clone
```

### **Option B: Linux Server**

```bash
# 1. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Install PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib

# 3. Create project directory
sudo mkdir -p /opt/network-monitoring
sudo chown $USER:$USER /opt/network-monitoring
cd /opt/network-monitoring

# 4. Copy project files
```

---

## Step 2: Configure Database (15 minutes)

### **Create Database**

```bash
# Login to PostgreSQL
psql -U postgres

# In PostgreSQL console:
CREATE DATABASE network_management_production;
CREATE USER netmon WITH ENCRYPTED PASSWORD 'strong_password_here';
GRANT ALL PRIVILEGES ON DATABASE network_management_production TO netmon;
\q
```

### **Update .env with Production Settings**

```env
PORT=80
HOST=0.0.0.0
DATABASE_URL=postgresql://netmon:strong_password_here@localhost:5432/network_management_production

# Monitoring
MONITORING_ENABLED=true
MONITORING_INTERVAL=60000
MONITORING_FAILS_REQUIRED=3

# Email alerts (configure with your office SMTP)
SMTP_HOST=smtp.office.local
SMTP_PORT=587
SMTP_USER=monitoring@office.local
SMTP_PASS=password_here
ALERT_EMAIL=itadmin@office.local

# Optional: Slack webhook for IT team
WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

---

## Step 3: Install Dependencies (5 minutes)

```bash
npm install --production
```

**Watch for errors!** If npm install fails:
- Check internet connection
- Try: `npm install --legacy-peer-deps`
- Clear cache: `npm cache clean --force`

---

## Step 4: First Start & Smoke Test (10 minutes)

```bash
# Start server
npm start

# You should see:
✓ Network Management Suite v2.0.0 started successfully
✓ Server running at http://localhost:80
✓ Database: postgresql://netmon@localhost:5432/network_management_production
✓ Enterprise monitoring system ACTIVATED
```

### **Immediate Tests:**

1. **Open browser:** http://your-server-ip
2. **Check dashboard loads**
3. **Go to Infrastructure tab** → Should be empty (good!)
4. **Go to IP & VLAN tab** → Should be empty (good!)

**If dashboard doesn't load:**
- Check firewall: `netsh advfirewall firewall add rule name="Network Monitoring" dir=in action=allow protocol=TCP localport=80`
- Check logs: `logs/application-YYYY-MM-DD.log`

---

## Step 5: Populate Your Network (1-2 hours)

### **A. Document Physical Infrastructure**

**Infrastructure Tab:**

1. **Add Rooms:**
   - Server Room (Floor: Ground, Purpose: Data Center)
   - IT Office (Floor: 1st, Purpose: Administration)
   - Building A (Floor: 1st, Purpose: Offices)
   - Building B (Floor: 2nd, Purpose: Labs)

2. **Add Wall Outlets:**
   - For each room, add outlets: "A-101", "A-102", etc.
   - Location: "Near door", "Back wall", etc.

3. **Add Patch Panels:**
   - Server Room Panel 1 (48 ports)
   - Server Room Panel 2 (48 ports)

4. **Add Cable Runs:**
   - Connect each outlet to patch panel
   - Cable type: Cat6
   - Mark as "Active"

### **B. Configure Network**

**IP & VLAN Tab:**

1. **Add VLANs:**
   ```
   VLAN 10 - Management (192.168.10.0/24, GW: 192.168.10.1)
   VLAN 20 - Servers (192.168.20.0/24, GW: 192.168.20.1)
   VLAN 30 - Staff (192.168.30.0/24, GW: 192.168.30.1)
   VLAN 40 - Guest (192.168.40.0/24, GW: 192.168.40.1)
   ```

2. **Add Critical Devices First:**
   ```
   Core Switch (192.168.10.1, Type: Switch, VLAN: Management)
   Main Router (192.168.10.2, Type: Router, VLAN: Management)
   File Server (192.168.20.10, Type: Server, VLAN: Servers)
   Domain Controller (192.168.20.11, Type: Server, VLAN: Servers)
   WiFi Controller (192.168.10.20, Type: Access Point, VLAN: Management)
   ```

3. **Enable Monitoring:**
   - Check "Monitor" checkbox for each critical device
   - Start with 5-10 most important devices

---

## Step 6: Test Monitoring (30 minutes)

### **Real Test Scenario:**

**Test 1: Verify Auto-Monitoring**
```bash
# Watch logs in real-time
tail -f logs/application-*.log

# You should see every 60 seconds:
INFO: Checking 5 monitored devices...
INFO: Monitoring cycle complete: 5 up, 0 down
```

**Test 2: Simulate Device Failure**
1. Find a non-critical switch or device
2. Enable monitoring on it
3. Unplug network cable
4. Watch the system:
   - Wait 3 minutes (3 failed checks)
   - Check logs for "ALERT: Device X is DOWN"
   - Check email inbox
   - Check Slack (if configured)
   - Check dashboard for red alert
   - Check incident was created

**Test 3: Recovery**
1. Plug device back in
2. Wait 1 minute
3. Verify:
   - "RECOVERY: Device X is back UP" in logs
   - Recovery email received
   - Incident auto-closed

---

## Step 7: Configure for 24/7 Operation (30 minutes)

### **Windows Server:**

```powershell
# 1. Install as Windows Service using PM2
npm install -g pm2
npm install -g pm2-windows-service

# 2. Configure PM2
pm2 start server/server.js --name network-monitoring
pm2 save

# 3. Setup PM2 as Windows Service
pm2-service-install
# Service name: pm2

# 4. Verify
pm2 list
```

### **Linux Server:**

```bash
# 1. Create systemd service
sudo nano /etc/systemd/system/network-monitoring.service
```

```ini
[Unit]
Description=Network Management Suite
After=network.target postgresql.service

[Service]
Type=simple
User=your-user
WorkingDirectory=/opt/network-monitoring
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node server/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# 2. Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable network-monitoring
sudo systemctl start network-monitoring

# 3. Check status
sudo systemctl status network-monitoring

# 4. View logs
sudo journalctl -u network-monitoring -f
```

---

## Step 8: Make Accessible to IT Team (15 minutes)

### **Setup Internal DNS (Optional but Recommended)**

**Windows DNS Server:**
```
Add A Record: monitoring.office.local → 192.168.10.50
```

**Linux /etc/hosts on staff computers:**
```
192.168.10.50  monitoring.office.local
```

### **Open in Browsers:**

**IT Admin workstation:**
```
http://monitoring.office.local
or
http://192.168.10.50
```

### **Test Multi-User:**
1. Open on your computer
2. Open on colleague's computer
3. Unplug a monitored device
4. **Both browsers should update simultaneously!**

---

## Step 9: Train IT Staff (30 minutes)

### **Quick Training Session:**

**Show them:**

1. **Dashboard** - Overview of everything
2. **Monitoring Tab** - See device status, check devices
3. **Incidents Tab** - See auto-created tickets
4. **Live Event Feed** - Real-time activity log
5. **Infrastructure Tab** - Document cables/outlets

**Key Points:**
- "System monitors automatically every 60 seconds"
- "You'll get email if device goes down"
- "Desktop notifications work - allow them in browser"
- "Green = UP, Red = DOWN, Yellow = Warning"
- "Incident tickets created automatically"

---

## Step 10: Go Live! (Ongoing)

### **Throughout the Day:**

**9:00 AM** - System running, 10 devices monitored  
**10:00 AM** - Add 20 more devices  
**11:00 AM** - First real alert! Server reboot triggered email  
**12:00 PM** - Lunch (system keeps monitoring!)  
**2:00 PM** - Add remaining 50 devices  
**3:00 PM** - Team comfortable with system  
**4:00 PM** - Configure webhook for Slack  
**5:00 PM** - Go home, system monitors 24/7!  

---

## 🔥 Common Issues & Solutions

### **Issue 1: Dashboard loads but monitoring doesn't work**

**Check:**
```bash
# Are devices marked as monitored?
psql -d network_management_production -c "SELECT name, monitored FROM devices;"

# Is monitoring enabled?
grep MONITORING_ENABLED .env
```

**Fix:**
- Enable monitoring: `MONITORING_ENABLED=true`
- Restart: `pm2 restart network-monitoring`

### **Issue 2: Email alerts not sending**

**Test SMTP manually:**
```bash
telnet smtp.office.local 587
```

**Check logs:**
```bash
tail -f logs/application-*.log | grep -i email
# Should see: "Email alerts configured"
```

**Common fixes:**
- Wrong SMTP port (try 25, 587, or 465)
- Firewall blocking SMTP
- Wrong username/password
- Gmail needs App Password, not regular password

### **Issue 3: WebSocket not connecting**

**Browser console (F12):**
```
Look for: "WebSocket connected"
If error: Check firewall, proxy, or reverse proxy config
```

**Fix:**
- Firewall: Allow WebSocket upgrade
- Nginx: Add WebSocket headers
- Check server logs for WebSocket errors

### **Issue 4: High CPU usage**

**If monitoring 100+ devices:**
```env
# Slow down checks
MONITORING_INTERVAL=120000  # Every 2 minutes

# Or reduce batch size
# In monitoring-service.js:
# batchSize = 5 (instead of 10)
```

### **Issue 5: Database growing too fast**

**Clean old monitoring history:**
```sql
-- Keep only last 30 days
DELETE FROM monitoring_history 
WHERE checked_at < NOW() - INTERVAL '30 days';

-- Keep only last 90 days of alerts
DELETE FROM alert_log 
WHERE created_at < NOW() - INTERVAL '90 days';
```

**Automate with cron:**
```bash
# Daily at 3 AM
0 3 * * * psql -d network_management_production -c "DELETE FROM monitoring_history WHERE checked_at < NOW() - INTERVAL '30 days';"
```

---

## 📊 Production Checklist

Before you leave the office:

- [ ] Server running as service (auto-starts on boot)
- [ ] 10+ critical devices monitored
- [ ] Email alerts tested and working
- [ ] At least 2 IT staff have access
- [ ] Dashboard accessible from IT office network
- [ ] Monitoring logs show regular check cycles
- [ ] Test incident created and resolved successfully
- [ ] Firewall rules configured (port 80)
- [ ] Backup configured (`npm run backup`)
- [ ] Documentation folder shared with team

---

## 🎯 Week 1 Goals

**Day 1 (Tomorrow):** Deploy, monitor 10 critical devices  
**Day 2:** Add all switches and routers (20-30 devices)  
**Day 3:** Add all servers (10-20 devices)  
**Day 4:** Document all cable runs  
**Day 5:** Add remaining devices, review alerts  

**By End of Week:**
- 100+ devices documented
- 30-50 devices monitored
- Email alerts working reliably
- Team trained and comfortable
- Incident workflow established

---

## 🚨 Emergency Contacts

**If system fails tomorrow:**

1. **Check logs first:**
   ```bash
   tail -100 logs/application-YYYY-MM-DD.log
   ```

2. **Restart service:**
   ```bash
   # Windows
   pm2 restart network-monitoring
   
   # Linux
   sudo systemctl restart network-monitoring
   ```

3. **Check database:**
   ```bash
   psql -d network_management_production -c "SELECT COUNT(*) FROM devices;"
   ```

4. **Worst case: Stop monitoring temporarily:**
   ```env
   MONITORING_ENABLED=false
   ```
   Then restart and debug without alerts flooding

---

## ✅ Success Metrics

**You'll know it's working when:**

✅ Dashboard loads in <2 seconds  
✅ Live indicator shows "● Live" in green  
✅ Event feed shows monitoring cycles  
✅ Test device down → Email received in 3 minutes  
✅ Multiple browsers update simultaneously  
✅ Incidents auto-created for failures  
✅ System runs overnight without issues  

---

## 🎉 You're Ready!

**Tomorrow morning:**
1. Arrive at office
2. Follow this guide step-by-step
3. Start with 5 critical devices
4. Test one failure scenario
5. Add more devices gradually
6. Train team
7. Go live!

**The system is production-ready. You've got this!** 💪

---

**Document Version:** 1.0  
**Last Updated:** September 10, 2026  
**For:** Head Admin Office Deployment  
**Status:** Ready for Production  

Good luck with your deployment tomorrow! 🚀
