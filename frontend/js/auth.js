document.addEventListener('DOMContentLoaded', () => {
  // Redirect if already logged in
  if (Auth.isLoggedIn()) {
    window.location.href = Auth.isAdmin() ? '/admin.html' : '/dashboard.html';
    return;
  }

  const form = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const submitBtn = document.getElementById('submitBtn');
  const togglePassword = document.getElementById('togglePassword');

  // Toggle password visibility
  togglePassword?.addEventListener('click', () => {
    const isText = passwordInput.type === 'text';
    passwordInput.type = isText ? 'password' : 'text';
    togglePassword.textContent = isText ? '👁' : '🙈';
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showToast('Please enter your email and password.', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Signing in…';

    try {
      const data = await apiCall('POST', '/auth/login', { email, password }, false);
      Auth.setSession(data);
      showToast(`Welcome back, ${data.name}!`, 'success');

      setTimeout(() => {
        window.location.href = data.role === 'admin' ? '/admin.html' : '/dashboard.html';
      }, 800);
    } catch (err) {
      showToast(err.message, 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Sign In';
    }
  });
});