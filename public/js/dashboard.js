// Modern Dashboard JavaScript

// ===== AUTHENTICATION =====
function checkAuth() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/auth.html';
    return false;
  }
  return true;
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
  // Check authentication
  if (!checkAuth()) return;

  // Load user info
  loadUserInfo();

  // Load organization info
  loadOrganization();

  // Initialize navigation
  initNavigation();

  // Initialize user dropdown
  initUserDropdown();

  // Initialize search
  initSearch();

  // Load dashboard data
  loadDashboardData();

  // Setup real-time updates
  setupWebSocket();
});

// ===== USER INFO =====
async function loadUserInfo() {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch('/api/auth/me', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load user info');
    }

    const data = await response.json();
    
    // Update UI with user info
    const userName = document.getElementById('userName');
    const userEmail = document.getElementById('userEmail');
    
    if (userName) userName.textContent = data.user.name;
    if (userEmail) userEmail.textContent = data.user.email;

    // Update avatar
    const userAvatar = document.querySelector('.user-avatar img');
    if (userAvatar) {
      const initials = data.user.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
      
      userAvatar.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%233b82f6'%3E%3Ccircle cx='12' cy='12' r='12'/%3E%3Ctext x='12' y='17' text-anchor='middle' fill='white' font-size='12' font-weight='bold'%3E${initials}%3C/text%3E%3C/svg%3E`;
    }
  } catch (error) {
    console.error('Error loading user info:', error);
    // If auth fails, redirect to login
    localStorage.removeItem('token');
    window.location.href = '/auth.html';
  }
}

// ===== ORGANIZATION =====
async function loadOrganization() {
  try {
    const org = JSON.parse(localStorage.getItem('organization') || '{}');
    
    // Update organization display
    const orgName = document.getElementById('orgName');
    if (orgName && org.name) {
      orgName.textContent = org.name;
    }

    // Update organization avatar
    const orgAvatar = document.querySelector('.org-avatar');
    if (orgAvatar && org.name) {
      const initials = org.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
      orgAvatar.textContent = initials;
    }

    // Update plan display
    const orgPlan = document.querySelector('.org-plan');
    if (orgPlan && org.subscription_tier) {
      const tierNames = {
        'free': 'Free Plan',
        'pro': 'Pro Plan',
        'enterprise': 'Enterprise Plan'
      };
      orgPlan.textContent = tierNames[org.subscription_tier] || org.subscription_tier;
    }
  } catch (error) {
    console.error('Error loading organization:', error);
  }
}

// ===== NAVIGATION =====
function initNavigation() {
  const navLinks = document.querySelectorAll('.nav-link');
  const pages = document.querySelectorAll('.page');

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const pageName = link.getAttribute('data-page');
      
      if (!pageName) return;

      // Remove active class from all links and pages
      navLinks.forEach(l => l.classList.remove('active'));
      pages.forEach(p => p.classList.remove('active'));

      // Add active class to clicked link
      link.classList.add('active');

      // Show corresponding page
      const page = document.getElementById(`page-${pageName}`);
      if (page) {
        page.classList.add('active');
      }
    });
  });
}

// ===== USER DROPDOWN =====
function initUserDropdown() {
  const userAvatar = document.querySelector('.user-avatar');
  const dropdown = document.getElementById('userDropdown');
  const logoutBtn = document.getElementById('logoutBtn');

  if (userAvatar && dropdown) {
    userAvatar.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('active');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && !userAvatar.contains(e.target)) {
        dropdown.classList.remove('active');
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await logout();
    });
  }
}

async function logout() {
  try {
    const token = localStorage.getItem('token');
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    // Clear local storage
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('organization');
    
    // Redirect to login
    window.location.href = '/auth.html';
  }
}

// ===== SEARCH =====
function initSearch() {
  const searchInput = document.getElementById('globalSearch');
  
  if (searchInput) {
    // Keyboard shortcut: Ctrl+K
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInput.focus();
      }
    });

    // Search input handler
    searchInput.addEventListener('input', debounce((e) => {
      const query = e.target.value.trim();
      if (query.length >= 2) {
        performSearch(query);
      }
    }, 300));
  }
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

async function performSearch(query) {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      const results = await response.json();
      displaySearchResults(results);
    }
  } catch (error) {
    console.error('Search error:', error);
  }
}

function displaySearchResults(results) {
  // TODO: Implement search results display
  console.log('Search results:', results);
}

// ===== DASHBOARD DATA =====
async function loadDashboardData() {
  try {
    const token = localStorage.getItem('token');
    
    // Load devices
    const devicesResponse = await fetch('/api/devices', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (devicesResponse.ok) {
      const devices = await devicesResponse.json();
      updateDashboardStats(devices);
    }

    // Load monitoring data
    const monitoringResponse = await fetch('/api/monitoring/status', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (monitoringResponse.ok) {
      const monitoring = await monitoringResponse.json();
      updateMonitoringStatus(monitoring);
    }

    // Load alerts
    const alertsResponse = await fetch('/api/alerts?limit=10', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (alertsResponse.ok) {
      const alerts = await alertsResponse.json();
      updateAlertsDisplay(alerts);
    }
  } catch (error) {
    console.error('Error loading dashboard data:', error);
  }
}

function updateDashboardStats(devices) {
  // Count online/offline devices
  const online = devices.filter(d => d.last_status === 'up').length;
  const offline = devices.filter(d => d.last_status === 'down').length;
  const total = devices.length;

  // Update UI
  const devicesOnline = document.getElementById('devicesOnline');
  if (devicesOnline) {
    devicesOnline.textContent = online;
  }

  // Update device count badge
  const deviceBadge = document.querySelector('[data-page="devices"] .badge');
  if (deviceBadge) {
    deviceBadge.textContent = total;
  }
}

function updateMonitoringStatus(data) {
  // TODO: Update monitoring charts and status
  console.log('Monitoring data:', data);
}

function updateAlertsDisplay(alerts) {
  const alertsList = document.getElementById('recentAlerts');
  if (!alertsList || !alerts.length) return;

  // Clear existing alerts
  alertsList.innerHTML = '';

  // Count critical alerts
  const critical = alerts.filter(a => a.severity === 'critical').length;
  const criticalBadge = document.querySelector('[data-page="alerts"] .badge-danger');
  if (criticalBadge && critical > 0) {
    criticalBadge.textContent = critical;
  }

  // Add new alerts
  alerts.slice(0, 4).forEach(alert => {
    const alertEl = createAlertElement(alert);
    alertsList.appendChild(alertEl);
  });
}

function createAlertElement(alert) {
  const div = document.createElement('div');
  const severityClass = `alert-${alert.severity || 'info'}`;
  const timeAgo = getTimeAgo(new Date(alert.created_at));
  
  const icons = {
    critical: 'fa-times-circle',
    warning: 'fa-exclamation-triangle',
    info: 'fa-info-circle',
    success: 'fa-check-circle'
  };

  div.className = `alert-item ${severityClass}`;
  div.innerHTML = `
    <div class="alert-icon"><i class="fas ${icons[alert.severity] || icons.info}"></i></div>
    <div class="alert-content">
      <div class="alert-title">${escapeHtml(alert.title || alert.message)}</div>
      <div class="alert-time">${timeAgo}</div>
    </div>
    <div class="alert-status">${alert.severity || 'info'}</div>
  `;
  
  return div;
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return `${seconds} seconds ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== WEBSOCKET =====
let ws = null;

function setupWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected, reconnecting...');
      setTimeout(setupWebSocket, 5000);
    };
  } catch (error) {
    console.error('Error setting up WebSocket:', error);
  }
}

function handleWebSocketMessage(data) {
  const eventFeed = document.getElementById('eventFeed');
  if (!eventFeed) return;

  // Create event element
  const eventEl = document.createElement('div');
  eventEl.className = 'event-item';
  
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
  
  let typeClass = 'event-info';
  let typeText = 'INFO';
  
  if (data.type === 'device_up') {
    typeClass = 'event-success';
    typeText = 'UP';
  } else if (data.type === 'device_down') {
    typeClass = 'event-danger';
    typeText = 'DOWN';
  } else if (data.type === 'alert') {
    typeClass = data.severity === 'critical' ? 'event-danger' : 'event-warning';
    typeText = 'ALERT';
  }
  
  eventEl.innerHTML = `
    <span class="event-time">${timeStr}</span>
    <span class="event-type ${typeClass}">${typeText}</span>
    <span class="event-message">${escapeHtml(data.message || JSON.stringify(data))}</span>
  `;
  
  // Add to top of feed
  eventFeed.insertBefore(eventEl, eventFeed.firstChild);
  
  // Keep only last 50 events
  while (eventFeed.children.length > 50) {
    eventFeed.removeChild(eventFeed.lastChild);
  }

  // Reload dashboard data if needed
  if (data.type === 'device_up' || data.type === 'device_down') {
    loadDashboardData();
  }
}

// ===== MOBILE MENU =====
const menuToggle = document.getElementById('menuToggle');
const sidebar = document.querySelector('.sidebar');

if (menuToggle && sidebar) {
  menuToggle.addEventListener('click', () => {
    sidebar.classList.toggle('active');
  });

  // Close sidebar when clicking outside on mobile
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768) {
      if (!sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
        sidebar.classList.remove('active');
      }
    }
  });
}

// ===== UTILITIES =====
window.addEventListener('beforeunload', () => {
  if (ws) {
    ws.close();
  }
});
