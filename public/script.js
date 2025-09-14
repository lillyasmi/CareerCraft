// =========== GLOBAL UI =============

// Theme toggle
const toggleBtn = document.getElementById('theme-toggle');
const root = document.body;

if (localStorage.getItem('theme') === 'light') {
  root.dataset.theme = 'light';
  toggleBtn.textContent = '☀️';
}

toggleBtn.addEventListener('click', () => {
  const newTheme = root.dataset.theme === 'light' ? 'dark' : 'light';
  root.dataset.theme = newTheme;
  toggleBtn.textContent = newTheme === 'light' ? '☀️' : '🌙';
  localStorage.setItem('theme', newTheme);
});

// Cursor-follow gradient
document.addEventListener('mousemove', e => {
  document.body.style.setProperty('--x', e.clientX + 'px');
  document.body.style.setProperty('--y', e.clientY + 'px');
});

// ===========
// (No resume logic here; keep your resume/AI JS in separate files for their pages)
// ===========
