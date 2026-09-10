// Team Management JavaScript

let currentOrgId = null;
let members = [];
let changingMember = null;
let removingMember = null;

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
  // Check authentication
  if (!checkAuth()) return;

  // Load initial data
  loadUserInfo();
  loadOrganization();
  loadTeamMembers();

  // Initialize event listeners
  initEventListeners();
});

function checkAuth() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/auth.html';
    return false;
  }
  return true;
}

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
    
    const userName = document.getElementById('userName');
    const userEmail = document.getElementById('userEmail');
    
    if (userName) userName.textContent = data.user.name;
    if (userEmail) userEmail.textContent = data.user.email;

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
    localStorage.removeItem('token');
    window.location.href = '/auth.html';
  }
}

async function loadOrganization() {
  try {
    const org = JSON.parse(localStorage.getItem('organization') || '{}');
    currentOrgId = org.id;
    
    const orgName = document.getElementById('orgName');
    if (orgName && org.name) {
      orgName.textContent = org.name;
    }

    const orgAvatar = document.getElementById('orgAvatar');
    if (orgAvatar && org.name) {
      const initials = org.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
      orgAvatar.textContent = initials;
    }
  } catch (error) {
    console.error('Error loading organization:', error);
  }
}

// ===== LOAD TEAM MEMBERS =====
async function loadTeamMembers() {
  if (!currentOrgId) {
    setTimeout(loadTeamMembers, 500);
    return;
  }

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/organizations/${currentOrgId}/members`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load team members');
    }

    members = await response.json();
    renderTeamMembers(members);
    updateTeamStats(members);
  } catch (error) {
    console.error('Error loading team members:', error);
    showError('Failed to load team members');
  }
}

function renderTeamMembers(membersList) {
  const tbody = document.getElementById('membersTableBody');
  
  if (membersList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state-inline">
            <i class="fas fa-users"></i>
            <h4>No team members yet</h4>
            <p>Invite your first team member to get started</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = membersList.map(member => {
    const initials = member.name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);

    const joinedDate = new Date(member.joined_at);
    const lastLogin = member.last_login ? new Date(member.last_login) : null;

    return `
      <tr>
        <td>
          <div class="member-cell">
            <div class="member-avatar">${initials}</div>
            <div class="member-details">
              <div class="member-name">${escapeHtml(member.name)}</div>
              <div class="member-email">${escapeHtml(member.email)}</div>
            </div>
          </div>
        </td>
        <td>
          <span class="role-badge role-${member.role}">
            <i class="fas ${getRoleIcon(member.role)}"></i>
            ${member.role}
          </span>
        </td>
        <td>
          <div class="date-display">
            ${formatDate(joinedDate)}
            <span class="date-relative">${getTimeAgo(joinedDate)}</span>
          </div>
        </td>
        <td>
          <div class="date-display">
            ${lastLogin ? formatDate(lastLogin) : 'Never'}
            ${lastLogin ? `<span class="date-relative">${getTimeAgo(lastLogin)}</span>` : ''}
          </div>
        </td>
        <td>
          ${member.invited_by_name ? escapeHtml(member.invited_by_name) : '-'}
        </td>
        <td>
          <div class="action-buttons">
            ${member.role !== 'owner' ? `
              <button class="action-btn" onclick="openChangeRoleModal('${member.id}')" title="Change role">
                <i class="fas fa-user-edit"></i>
              </button>
              <button class="action-btn danger" onclick="openRemoveMemberModal('${member.id}')" title="Remove member">
                <i class="fas fa-trash"></i>
              </button>
            ` : '<span style="color: var(--text-muted); font-size: 0.85rem;">Owner</span>'}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function updateTeamStats(membersList) {
  const totalMembers = document.getElementById('totalMembers');
  const adminCount = document.getElementById('adminCount');
  const lastLogin = document.getElementById('lastLogin');
  const inactiveCount = document.getElementById('inactiveCount');

  if (totalMembers) {
    totalMembers.textContent = membersList.length;
  }

  if (adminCount) {
    const admins = membersList.filter(m => m.role === 'admin' || m.role === 'owner').length;
    adminCount.textContent = admins;
  }

  if (lastLogin) {
    const logins = membersList
      .filter(m => m.last_login)
      .map(m => new Date(m.last_login))
      .sort((a, b) => b - a);
    
    if (logins.length > 0) {
      lastLogin.textContent = getTimeAgo(logins[0]);
    } else {
      lastLogin.textContent = 'Never';
    }
  }

  if (inactiveCount) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const inactive = membersList.filter(m => {
      if (!m.last_login) return true;
      return new Date(m.last_login) < thirtyDaysAgo;
    }).length;
    
    inactiveCount.textContent = inactive;
  }
}

// ===== EVENT LISTENERS =====
function initEventListeners() {
  // Invite member button
  document.getElementById('inviteMemberBtn').addEventListener('click', openInviteModal);

  // Modal close buttons
  document.getElementById('closeModal').addEventListener('click', closeInviteModal);
  document.getElementById('modalOverlay').addEventListener('click', closeInviteModal);
  document.getElementById('cancelInviteBtn').addEventListener('click', closeInviteModal);

  // Invite form
  document.getElementById('inviteForm').addEventListener('submit', handleInvite);

  // Role selector change
  document.getElementById('inviteRole').addEventListener('change', updateRoleDescription);

  // Change role modal
  document.getElementById('closeRoleModal').addEventListener('click', closeChangeRoleModal);
  document.getElementById('roleModalOverlay').addEventListener('click', closeChangeRoleModal);
  document.getElementById('cancelRoleBtn').addEventListener('click', closeChangeRoleModal);
  document.getElementById('changeRoleForm').addEventListener('submit', handleRoleChange);

  // Remove member modal
  document.getElementById('closeRemoveModal').addEventListener('click', closeRemoveMemberModal);
  document.getElementById('removeModalOverlay').addEventListener('click', closeRemoveMemberModal);
  document.getElementById('cancelRemoveBtn').addEventListener('click', closeRemoveMemberModal);
  document.getElementById('confirmRemoveBtn').addEventListener('click', handleRemoveMember);

  // User dropdown
  const userAvatar = document.querySelector('.user-avatar');
  const dropdown = document.getElementById('userDropdown');
  if (userAvatar && dropdown) {
    userAvatar.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('active');
    });
  }

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', logout);

  // Refresh
  document.getElementById('refreshBtn').addEventListener('click', loadTeamMembers);

  // Role filter
  document.getElementById('roleFilter').addEventListener('change', handleRoleFilter);

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('userDropdown');
    if (dropdown && !e.target.closest('.user-menu')) {
      dropdown.classList.remove('active');
    }
  });

  // Mobile menu
  const menuToggle = document.getElementById('menuToggle');
  const sidebar = document.querySelector('.sidebar');
  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('active');
    });
  }
}

// ===== INVITE MEMBER =====
function openInviteModal() {
  document.getElementById('inviteModal').classList.add('active');
  document.getElementById('inviteEmail').focus();
  document.getElementById('inviteForm').reset();
  document.getElementById('inviteError').style.display = 'none';
  updateRoleDescription();
}

function closeInviteModal() {
  document.getElementById('inviteModal').classList.remove('active');
}

function updateRoleDescription() {
  const role = document.getElementById('inviteRole').value;
  const descriptions = {
    owner: {
      title: 'Owner Permissions:',
      items: [
        'Full control over organization',
        'Manage all users and roles',
        'Delete organization',
        'All admin permissions'
      ]
    },
    admin: {
      title: 'Admin Permissions:',
      items: [
        'Manage team members',
        'Add, edit, and delete devices',
        'Configure organization settings',
        'View all reports and analytics'
      ]
    },
    member: {
      title: 'Member Permissions:',
      items: [
        'View all devices and infrastructure',
        'Add, edit, and delete devices',
        'Configure monitoring',
        'Create and resolve issues'
      ]
    },
    viewer: {
      title: 'Viewer Permissions:',
      items: [
        'View all devices (read-only)',
        'View infrastructure (read-only)',
        'View monitoring data',
        'Cannot make any changes'
      ]
    }
  };

  const desc = descriptions[role];
  const descEl = document.getElementById('roleDescription');
  
  descEl.innerHTML = `
    <strong>${desc.title}</strong>
    <ul>
      ${desc.items.map(item => `<li>${item}</li>`).join('')}
    </ul>
  `;
}

async function handleInvite(e) {
  e.preventDefault();
  
  const email = document.getElementById('inviteEmail').value.trim();
  const role = document.getElementById('inviteRole').value;
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const errorEl = document.getElementById('inviteError');

  errorEl.style.display = 'none';
  setButtonLoading(submitBtn, true);

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/organizations/${currentOrgId}/members`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, role })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to invite member');
    }

    closeInviteModal();
    await loadTeamMembers();
    showSuccess('Team member invited successfully!');
  } catch (error) {
    console.error('Invite error:', error);
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
  } finally {
    setButtonLoading(submitBtn, false);
  }
}

// ===== CHANGE ROLE =====
window.openChangeRoleModal = function(memberId) {
  changingMember = members.find(m => m.id === memberId);
  if (!changingMember) return;

  const modal = document.getElementById('changeRoleModal');
  const info = document.getElementById('changingMemberInfo');
  const select = document.getElementById('newRole');

  const initials = changingMember.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

  info.innerHTML = `
    <div class="member-avatar">${initials}</div>
    <div>
      <div class="member-name">${escapeHtml(changingMember.name)}</div>
      <div class="member-email">${escapeHtml(changingMember.email)}</div>
    </div>
  `;

  select.value = changingMember.role;
  document.getElementById('roleChangeError').style.display = 'none';
  modal.classList.add('active');
};

function closeChangeRoleModal() {
  document.getElementById('changeRoleModal').classList.remove('active');
  changingMember = null;
}

async function handleRoleChange(e) {
  e.preventDefault();
  
  if (!changingMember) return;

  const newRole = document.getElementById('newRole').value;
  const errorEl = document.getElementById('roleChangeError');

  errorEl.style.display = 'none';

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/organizations/${currentOrgId}/members/${changingMember.id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ role: newRole })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to update role');
    }

    closeChangeRoleModal();
    await loadTeamMembers();
    showSuccess('Member role updated successfully!');
  } catch (error) {
    console.error('Role change error:', error);
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
  }
}

// ===== REMOVE MEMBER =====
window.openRemoveMemberModal = function(memberId) {
  removingMember = members.find(m => m.id === memberId);
  if (!removingMember) return;

  const modal = document.getElementById('removeMemberModal');
  const nameEl = document.getElementById('removingMemberName');

  nameEl.textContent = removingMember.name;
  document.getElementById('removeError').style.display = 'none';
  modal.classList.add('active');
};

function closeRemoveMemberModal() {
  document.getElementById('removeMemberModal').classList.remove('active');
  removingMember = null;
}

async function handleRemoveMember() {
  if (!removingMember) return;

  const errorEl = document.getElementById('removeError');
  const confirmBtn = document.getElementById('confirmRemoveBtn');

  errorEl.style.display = 'none';
  confirmBtn.disabled = true;

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/organizations/${currentOrgId}/members/${removingMember.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to remove member');
    }

    closeRemoveMemberModal();
    await loadTeamMembers();
    showSuccess('Member removed successfully!');
  } catch (error) {
    console.error('Remove member error:', error);
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
  } finally {
    confirmBtn.disabled = false;
  }
}

// ===== ROLE FILTER =====
function handleRoleFilter(e) {
  const selectedRole = e.target.value;
  
  if (!selectedRole) {
    renderTeamMembers(members);
  } else {
    const filtered = members.filter(m => m.role === selectedRole);
    renderTeamMembers(filtered);
  }
}

// ===== UTILITIES =====
function getRoleIcon(role) {
  const icons = {
    owner: 'fa-crown',
    admin: 'fa-user-shield',
    member: 'fa-user',
    viewer: 'fa-eye'
  };
  return icons[role] || 'fa-user';
}

function formatDate(date) {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return `${Math.floor(seconds / 2592000)}mo ago`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function setButtonLoading(button, isLoading) {
  const textEl = button.querySelector('.btn-text');
  const loaderEl = button.querySelector('.btn-loader');
  
  if (isLoading) {
    if (textEl) textEl.style.display = 'none';
    if (loaderEl) loaderEl.style.display = 'inline-block';
    button.disabled = true;
  } else {
    if (textEl) textEl.style.display = 'inline';
    if (loaderEl) loaderEl.style.display = 'none';
    button.disabled = false;
  }
}

function showSuccess(message) {
  // Simple toast notification (can be enhanced)
  const toast = document.createElement('div');
  toast.className = 'success-message';
  toast.style.cssText = 'position: fixed; top: 80px; right: 24px; z-index: 9999; animation: slideInRight 0.3s ease-out;';
  toast.innerHTML = `
    <i class="fas fa-check-circle"></i>
    <span>${message}</span>
  `;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function showError(message) {
  console.error(message);
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
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('organization');
    window.location.href = '/auth.html';
  }
}
