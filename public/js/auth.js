// Authentication Page JavaScript

// Show/Hide forms
function showLogin() {
  document.getElementById('loginForm').classList.add('active');
  document.getElementById('signupForm').classList.remove('active');
  clearErrors();
}

function showSignup() {
  document.getElementById('signupForm').classList.add('active');
  document.getElementById('loginForm').classList.remove('active');
  clearErrors();
}

function clearErrors() {
  document.getElementById('loginError').style.display = 'none';
  document.getElementById('signupError').style.display = 'none';
}

function showError(formType, message) {
  const errorEl = document.getElementById(`${formType}Error`);
  errorEl.textContent = message;
  errorEl.style.display = 'block';
}

function setButtonLoading(button, isLoading) {
  if (isLoading) {
    button.classList.add('loading');
    button.disabled = true;
  } else {
    button.classList.remove('loading');
    button.disabled = false;
  }
}

// Login Form Handler
document.getElementById('loginFormElement').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();
  
  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const formData = new FormData(form);
  
  const data = {
    email: formData.get('email'),
    password: formData.get('password')
  };
  
  try {
    setButtonLoading(submitBtn, true);
    
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Login failed');
    }
    
    // Store token
    localStorage.setItem('token', result.token);
    localStorage.setItem('user', JSON.stringify(result.user));
    localStorage.setItem('organization', JSON.stringify(result.organization));
    
    // Redirect to dashboard
    window.location.href = '/dashboard.html';
    
  } catch (error) {
    console.error('Login error:', error);
    showError('login', error.message || 'Login failed. Please try again.');
  } finally {
    setButtonLoading(submitBtn, false);
  }
});

// Signup Form Handler
document.getElementById('signupFormElement').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();
  
  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const formData = new FormData(form);
  
  const data = {
    name: formData.get('name'),
    email: formData.get('email'),
    organizationName: formData.get('organizationName'),
    password: formData.get('password')
  };
  
  // Validation
  if (data.password.length < 8) {
    showError('signup', 'Password must be at least 8 characters long');
    return;
  }
  
  try {
    setButtonLoading(submitBtn, true);
    
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Signup failed');
    }
    
    // Store token
    localStorage.setItem('token', result.token);
    localStorage.setItem('user', JSON.stringify(result.user));
    localStorage.setItem('organization', JSON.stringify(result.organization));
    
    // Redirect to dashboard with onboarding flag
    window.location.href = '/dashboard.html?onboarding=true';
    
  } catch (error) {
    console.error('Signup error:', error);
    showError('signup', error.message || 'Signup failed. Please try again.');
  } finally {
    setButtonLoading(submitBtn, false);
  }
});

// Check if already logged in
document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  if (token) {
    // Verify token is still valid
    fetch('/api/auth/me', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    .then(response => {
      if (response.ok) {
        // Already logged in, redirect to dashboard
        window.location.href = '/dashboard.html';
      } else {
        // Token invalid, clear storage
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('organization');
      }
    })
    .catch(() => {
      // Error checking token, clear storage
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('organization');
    });
  }
});
