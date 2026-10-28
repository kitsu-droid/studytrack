// ===== Sidebar Toggle =====
const sidebar = document.getElementById('sidebar');
const openMenuBtn = document.getElementById('open-menu');
const closeMenuBtn = document.getElementById('close-menu');
const menuOverlay = document.getElementById('menu-overlay');

function openSidebar() {
  sidebar.classList.add('open');
  menuOverlay.hidden = false;
  openMenuBtn.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  sidebar.classList.remove('open');
  menuOverlay.hidden = true;
  openMenuBtn.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

openMenuBtn?.addEventListener('click', openSidebar);
closeMenuBtn?.addEventListener('click', closeSidebar);
menuOverlay?.addEventListener('click', closeSidebar);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sidebar.classList.contains('open')) {
    closeSidebar();
  }
});

window.addEventListener('resize', () => {
  if (window.innerWidth >= 900) {
    closeSidebar();
  }
});

// ===== Fetch Homework from Supabase =====
let cachedHomework = [];

async function fetchHomework() {
  const { data: { user } } = await supabaseClient.auth.getUser();

  if (!user) {
    cachedHomework = [];
    return [];
  }

  const { data, error } = await supabaseClient
    .from('homework')
    .select('*')
    .eq('user_id', user.id)
    .order('due_at', { ascending: true });

  if (error) {
    console.error('Error fetching homework:', error);
    cachedHomework = [];
    return [];
  }

  cachedHomework = data.map(row => ({
    id: row.id,
    title: row.title,
    subject: row.subject,
    description: row.description,
    dueDate: new Date(row.due_at),
    status: getRowStatus(row),
  }));

  return cachedHomework;
}

function getRowStatus(row) {
  if (row.deleted_at) return 'trash';
  if (row.archived_at) return 'archive';
  if (row.completed_at) return 'completed';
  if (new Date(row.due_at) < new Date()) return 'missing';
  return 'pending';
}

// ===== Render Homework Cards into the DOM =====
function renderHomeworkCard(item) {
  const card = document.createElement('article');
  card.className = 'homework-card';
  card.dataset.status = item.status;
  card.dataset.id = item.id;

  const statusLabel = item.status.charAt(0).toUpperCase() + item.status.slice(1);

  card.innerHTML = `
    <div class="homework-details">
      <p class="subject">${item.subject || 'General'}</p>
      <h3>${item.title}</h3>
      <p>${item.description || ''}</p>
      <p class="due-date">
        Due: <time datetime="${item.dueDate.toISOString()}">${item.dueDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</time>
      </p>
    </div>
    <div class="homework-actions">
      <span class="status status-${item.status}">${statusLabel}</span>
      <button type="button" class="edit-homework">Edit</button>
      ${item.status !== 'completed' ? '<button type="button" class="complete-homework">Mark Completed</button>' : ''}
      <button type="button" class="archive-homework">Archive</button>
      <button type="button" class="delete-homework">Move to Trash</button>
    </div>
  `;

  return card;
}

async function loadAndRenderHomework() {
  if (!homeworkListEl) return; // not on this page

  const items = await fetchHomework();

  homeworkListEl.innerHTML = '';
  items
    .filter(i => i.status !== 'trash')
    .forEach(item => {
      homeworkListEl.appendChild(renderHomeworkCard(item));
    });

  attachCardActions();
  refreshDashboard();
}

// ===== Determine "Missing" status dynamically =====
function updateMissingStatuses(items) {
  const now = new Date();
  items.forEach(item => {
    if (item.status === 'pending' && item.dueDate && item.dueDate < now) {
      item.status = 'missing';
      if (item.element) {
        item.element.dataset.status = 'missing';
        const statusBadge = item.element.querySelector('.status');
        if (statusBadge) {
          statusBadge.textContent = 'Missing';
          statusBadge.className = 'status status-missing';
        }
      }
    }
  });
}

// ===== Dashboard: Progress Ring =====
function updateProgressRing(items) {
  const ring = document.getElementById('progress-ring-fill');
  const percentLabel = document.getElementById('progress-percent');
  const progressLabel = document.getElementById('progress-label');
  if (!ring) return; // not on this page

  const visible = items.filter(i => i.status !== 'archive' && i.status !== 'trash');
  const total = visible.length;
  const completed = visible.filter(i => i.status === 'completed').length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  const circumference = 326.7;
  const offset = circumference - (percent / 100) * circumference;

  ring.style.strokeDashoffset = offset;
  percentLabel.textContent = `${percent}%`;
  progressLabel.textContent = `${completed} of ${total} assignments completed`;
}

// ===== Dashboard: Upcoming Deadlines =====
function formatCountdown(dueDate) {
  const now = new Date();
  const diffMs = dueDate - now;
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffMs < 0) return { label: 'Overdue', urgent: true };
  if (diffHours <= 24) return { label: `Due in ${diffHours}h`, urgent: true };
  return { label: `Due in ${diffDays}d`, urgent: false };
}

function renderUpcomingDeadlines(items) {
  const container = document.getElementById('upcoming-deadlines');
  const emptyState = document.getElementById('upcoming-empty-state');
  if (!container) return;

  const now = new Date();
  const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const upcoming = items
    .filter(i => (i.status === 'pending' || i.status === 'missing') && i.dueDate)
    .filter(i => i.dueDate <= sevenDaysOut)
    .sort((a, b) => a.dueDate - b.dueDate)
    .slice(0, 5);

  container.innerHTML = '';

  if (upcoming.length === 0) {
    if (emptyState) emptyState.hidden = false;
    return;
  }

  if (emptyState) emptyState.hidden = true;

  upcoming.forEach(item => {
    const { label, urgent } = formatCountdown(item.dueDate);

    const el = document.createElement('div');
    el.className = 'deadline-item';
    el.innerHTML = `
      <div class="deadline-item-info">
        <h4>${item.title || 'Untitled'}</h4>
        <p>${item.subject || ''}</p>
      </div>
      <span class="deadline-countdown ${urgent ? 'urgent' : ''}">${label}</span>
    `;
    container.appendChild(el);
  });
}

function renderSubjectBreakdown(items) {
  const container = document.getElementById('subject-breakdown');
  if (!container) return;

  const visible = items.filter(i => i.status !== 'archive' && i.status !== 'trash');
  const bySubject = {};

  visible.forEach(item => {
    const subject = item.subject || 'Other';
    if (!bySubject[subject]) bySubject[subject] = { total: 0, completed: 0 };
    bySubject[subject].total++;
    if (item.status === 'completed') bySubject[subject].completed++;
  });

  container.innerHTML = '';

  Object.entries(bySubject).forEach(([subject, data]) => {
    const percent = Math.round((data.completed / data.total) * 100);

    const el = document.createElement('div');
    el.className = 'subject-bar-item';
    el.innerHTML = `
      <div class="subject-bar-header">
        <span>${subject}</span>
        <span>${data.completed}/${data.total}</span>
      </div>
      <div class="subject-bar-track">
        <div class="subject-bar-fill" style="width: ${percent}%"></div>
      </div>
    `;
    container.appendChild(el);
  });
}

// ===== Pulse helpers (animation triggers) =====
function pulseBadge(card) {
  const badge = card.querySelector('.status');
  if (!badge) return;
  badge.classList.add('updated');
  badge.addEventListener('animationend', () => badge.classList.remove('updated'), { once: true });
}

function pulseNumber(el) {
  el.classList.add('updated');
  el.addEventListener('animationend', () => el.classList.remove('updated'), { once: true });
}

// ===== Card removal with animation =====
function removeCardWithAnimation(card, newStatus) {
  card.classList.add('removing');
  card.addEventListener('animationend', () => {
    card.dataset.status = newStatus;
    card.hidden = true;
    card.classList.remove('removing');
    refreshDashboard();
  }, { once: true });
}

// ===== Update Summary Cards (with pulse) =====
function updateSummary(items) {
  const visible = items.filter(i => i.status !== 'archive' && i.status !== 'trash');

  const values = {
    'total-homework': visible.length,
    'pending-homework': visible.filter(i => i.status === 'pending').length,
    'missing-homework': visible.filter(i => i.status === 'missing').length,
    'completed-homework': visible.filter(i => i.status === 'completed').length,
  };

  Object.entries(values).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.textContent !== String(value)) {
      el.textContent = value;
      pulseNumber(el);
    }
  });
}

// ===== Filter Buttons (with fade transition) =====
const filterButtons = document.querySelectorAll('.homework-filters button');
const homeworkListEl = document.getElementById('homework-list');
const emptyStateEl = document.getElementById('empty-state');

function applyFilter(filter, items) {
  if (!homeworkListEl) return;
  homeworkListEl.classList.add('filtering');

  setTimeout(() => {
    let visibleCount = 0;

    items.forEach(item => {
      const matches = filter === 'all'
        ? item.status !== 'archive' && item.status !== 'trash'
        : item.status === filter;
      item.element.hidden = !matches;
      if (matches) visibleCount++;
    });

    if (emptyStateEl) emptyStateEl.hidden = visibleCount !== 0;
    homeworkListEl.hidden = visibleCount === 0;

    homeworkListEl.classList.remove('filtering');
  }, 150);
}

filterButtons.forEach(button => {
  button.addEventListener('click', () => {
    filterButtons.forEach(b => b.setAttribute('aria-pressed', 'false'));
    button.setAttribute('aria-pressed', 'true');

    const filter = button.dataset.filter;
    const items = cachedHomework.map(item => ({
     element: document.querySelector(`.homework-card[data-id="${item.id}"]`),
     status: item.status,
     dueDate: item.dueDate,
    })).filter(i => i.element);
    applyFilter(filter, items);
  });
});

// ===== Homework Card Actions =====
function attachCardActions() {
  document.querySelectorAll('.complete-homework').forEach(btn => {
  btn.addEventListener('click', async () => {
    const card = btn.closest('.homework-card');
    const id = card.dataset.id;

    const { error } = await supabaseClient
      .from('homework')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Error completing homework:', error);
      return;
    }

    const cachedItem = cachedHomework.find(h => h.id === id);
    if (cachedItem) cachedItem.status = 'completed';

    card.dataset.status = 'completed';
    const statusBadge = card.querySelector('.status');
    statusBadge.textContent = 'Completed';
    statusBadge.className = 'status status-completed';
    pulseBadge(card);

    btn.remove();
    refreshDashboard();
  });
});

  document.querySelectorAll('.archive-homework').forEach(btn => {
  btn.addEventListener('click', async () => {
    const card = btn.closest('.homework-card');
    const id = card.dataset.id;

    const { error } = await supabaseClient
      .from('homework')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Error archiving homework:', error);
      return;
    }

    const cachedItem = cachedHomework.find(h => h.id === id);
    if (cachedItem) cachedItem.status = 'archive';

    removeCardWithAnimation(card, 'archive');
  });
});

document.querySelectorAll('.delete-homework').forEach(btn => {
  btn.addEventListener('click', async () => {
    const card = btn.closest('.homework-card');
    const id = card.dataset.id;

    const { error } = await supabaseClient
      .from('homework')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Error trashing homework:', error);
      return;
    }

    const cachedItem = cachedHomework.find(h => h.id === id);
    if (cachedItem) cachedItem.status = 'trash';

    removeCardWithAnimation(card, 'trash');
  });
});

  document.querySelectorAll('.edit-homework').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.homework-card');
      window.location.href = `add-homework.html?edit=${encodeURIComponent(card.querySelector('h3').textContent)}`;
    });
  });
}

// ===== Refresh everything after a change =====
function refreshDashboard() {
  const items = cachedHomework.map(item => ({
    element: document.querySelector(`.homework-card[data-id="${item.id}"]`),
    status: item.status,
    dueDate: item.dueDate,
    title: item.title,
    subject: item.subject,
  }));

  updateMissingStatuses(items);
  updateSummary(items);
  updateProgressRing(items);
  renderUpcomingDeadlines(items);
  renderSubjectBreakdown(items);

  const activeFilter = document.querySelector('.homework-filters button[aria-pressed="true"]')?.dataset.filter || 'all';
  if (homeworkListEl) applyFilter(activeFilter, items);
}

// ===== Dashboard: Load real homework data on this page =====
(async function initDashboardData() {
  const progressRing = document.getElementById('progress-ring-fill');
  if (!progressRing) return; // not on this page

  await fetchHomework(); // populates cachedHomework
  refreshDashboard();
})();

// ===== Add Homework Form (with validation shake) =====
const homeworkForm = document.getElementById('homework-form');

homeworkForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const fields = {
    title: document.getElementById('title'),
    subject: document.getElementById('subject'),
    'due-date': document.getElementById('due-date'),
    'due-time': document.getElementById('due-time'),
  };

  let isValid = true;
  document.querySelectorAll('.field-error').forEach(el => el.hidden = true);
  document.querySelectorAll('.form-group').forEach(el => el.classList.remove('shake'));

  Object.entries(fields).forEach(([key, el]) => {
    if (!el.value.trim()) {
      const errorEl = document.getElementById(`${key}-error`);
      if (errorEl) errorEl.hidden = false;
      el.closest('.form-group').classList.add('shake');
      isValid = false;
    }
  });

  if (!isValid) return;

  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  const submitBtn = document.getElementById('submit-button');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  const { error } = await supabaseClient.from('homework').insert({
    user_id: user.id,
    title: fields.title.value.trim(),
    subject: fields.subject.value,
    description: document.getElementById('description').value.trim() || null,
    due_at: new Date(`${fields['due-date'].value}T${fields['due-time'].value}`).toISOString(),
  });

  submitBtn.disabled = false;
  submitBtn.textContent = 'Add Assignment';

  if (error) {
    const formError = document.getElementById('form-error');
    formError.textContent = error.message;
    formError.hidden = false;
    return;
  }

  window.location.href = 'index.html';
});

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  loadAndRenderHomework();
});

// ===== Auth: Login Form =====
const loginForm = document.getElementById('login-form');

loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const formError = document.getElementById('form-error');
  let isValid = true;

  document.querySelectorAll('.field-error').forEach(el => el.hidden = true);
  document.querySelectorAll('.form-group').forEach(el => el.classList.remove('shake'));
  formError.hidden = true;

  if (!email.value.includes('@')) {
    document.getElementById('email-error').hidden = false;
    email.closest('.form-group').classList.add('shake');
    isValid = false;
  }

  if (!password.value) {
    document.getElementById('password-error').hidden = false;
    password.closest('.form-group').classList.add('shake');
    isValid = false;
  }

  if (!isValid) return;

  const submitBtn = document.getElementById('submit-button');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Logging in...';

  const { error } = await supabaseClient.auth.signInWithPassword({
    email: email.value,
    password: password.value,
  });

  submitBtn.disabled = false;
  submitBtn.textContent = 'Log In';

  if (error) {
    formError.textContent = error.message;
    formError.hidden = false;
    return;
  }

  window.location.href = 'index.html';
});

// ===== Auth: Register Form =====
const registerForm = document.getElementById('register-form');

registerForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('display-name');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const confirmPassword = document.getElementById('confirm-password');
  const terms = document.getElementById('terms');
  const formError = document.getElementById('form-error');
  let isValid = true;

  document.querySelectorAll('.field-error').forEach(el => el.hidden = true);
  document.querySelectorAll('.form-group').forEach(el => el.classList.remove('shake'));
  formError.hidden = true;

  if (!name.value.trim()) {
    document.getElementById('display-name-error').hidden = false;
    name.closest('.form-group').classList.add('shake');
    isValid = false;
  }
  if (!email.value.includes('@')) {
    document.getElementById('email-error').hidden = false;
    email.closest('.form-group').classList.add('shake');
    isValid = false;
  }
  if (password.value.length < 8) {
    document.getElementById('password-error').hidden = false;
    password.closest('.form-group').classList.add('shake');
    isValid = false;
  }
  if (confirmPassword.value !== password.value) {
    document.getElementById('confirm-password-error').hidden = false;
    confirmPassword.closest('.form-group').classList.add('shake');
    isValid = false;
  }
  if (!terms.checked) {
    document.getElementById('terms-error').hidden = false;
    isValid = false;
  }

  if (!isValid) return;

  const submitBtn = document.getElementById('submit-button');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating account...';

  const { error } = await supabaseClient.auth.signUp({
  email: email.value,
  password: password.value,
  options: {
    data: { display_name: name.value.trim() },
    emailRedirectTo: window.location.origin + '/index.html',
  },
});

  submitBtn.disabled = false;
  submitBtn.textContent = 'Create Account';

  if (error) {
    formError.textContent = error.message;
    formError.hidden = false;
    return;
  }

  formError.hidden = false;
  formError.style.color = 'var(--mint-dark)';
  formError.style.background = 'var(--mint)';
  formError.textContent = 'Account created! Check your email to verify, then log in.';
  registerForm.reset();
});

// ===== Auth: Reset Password Form =====
const resetForm = document.getElementById('reset-form');

resetForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email');
  const requestCard = document.getElementById('reset-request-card');
  const sentCard = document.getElementById('reset-sent-card');
  const sentMessage = document.getElementById('reset-sent-message');

  document.querySelectorAll('.field-error').forEach(el => el.hidden = true);
  document.querySelectorAll('.form-group').forEach(el => el.classList.remove('shake'));

  if (!email.value.includes('@')) {
    document.getElementById('email-error').hidden = false;
    email.closest('.form-group').classList.add('shake');
    return;
  }

  const submitBtn = document.getElementById('submit-button');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending...';

  const { error } = await supabaseClient.auth.resetPasswordForEmail(email.value, {
    redirectTo: window.location.origin + '/settings.html',
  });

  submitBtn.disabled = false;
  submitBtn.textContent = 'Send Reset Link';

  if (error) {
    const formError = document.getElementById('form-error');
    formError.textContent = error.message;
    formError.hidden = false;
    return;
  }

  sentMessage.textContent = `We've sent a password reset link to ${email.value}.`;
  requestCard.hidden = true;
  sentCard.hidden = false;
});

// ===== Calendar =====
(function initCalendar() {
  const grid = document.getElementById('calendar-grid');
  if (!grid) return; // not on this page

  const monthLabel = document.getElementById('calendar-month-label');
  const prevBtn = document.getElementById('prev-month');
  const nextBtn = document.getElementById('next-month');
  const selectedDateLabel = document.getElementById('selected-date-label');
  const selectedDateList = document.getElementById('selected-date-list');
  const selectedDateEmpty = document.getElementById('selected-date-empty');

  let currentDate = new Date();
  let selectedDate = new Date();
  let calendarItems = [];

  async function loadCalendarHomework() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabaseClient
      .from('homework')
      .select('*')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .is('archived_at', null)
      .order('due_at', { ascending: true });

    if (error) {
      console.error('Error loading calendar homework:', error);
      return [];
    }

    return data.map(row => ({
      title: row.title,
      subject: row.subject || 'General',
      status: getRowStatus(row),
      dueDate: new Date(row.due_at),
    }));
  }

  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }

  function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    monthLabel.textContent = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const firstDayOfMonth = new Date(year, month, 1);
    const startOffset = firstDayOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    grid.innerHTML = '';

    for (let i = 0; i < startOffset; i++) {
      const emptyCell = document.createElement('div');
      emptyCell.className = 'calendar-day empty';
      grid.appendChild(emptyCell);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const thisDate = new Date(year, month, day);
      const dayEl = document.createElement('div');
      dayEl.className = 'calendar-day';

      if (isSameDay(thisDate, today)) dayEl.classList.add('today');
      if (isSameDay(thisDate, selectedDate)) dayEl.classList.add('selected');

      const dayItems = calendarItems.filter(item => isSameDay(item.dueDate, thisDate));

      dayEl.innerHTML = `
        <span class="calendar-day-number">${day}</span>
        <div class="calendar-day-dots">
          ${dayItems.slice(0, 3).map(item => `<span class="calendar-dot ${item.status}"></span>`).join('')}
        </div>
      `;

      dayEl.addEventListener('click', () => {
        selectedDate = thisDate;
        renderCalendar();
        renderSelectedDate();
      });

      grid.appendChild(dayEl);
    }
  }

  function renderSelectedDate() {
    const dayItems = calendarItems.filter(item => isSameDay(item.dueDate, selectedDate));
    const today = new Date();

    selectedDateLabel.textContent = isSameDay(selectedDate, today)
      ? 'Today'
      : selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    selectedDateList.innerHTML = '';

    if (dayItems.length === 0) {
      selectedDateEmpty.hidden = false;
      selectedDateList.hidden = true;
      return;
    }

    selectedDateEmpty.hidden = true;
    selectedDateList.hidden = false;

    dayItems.forEach(item => {
      const el = document.createElement('div');
      el.className = 'deadline-item';
      el.innerHTML = `
        <div class="deadline-item-info">
          <h4>${item.title}</h4>
          <p>${item.subject}</p>
        </div>
        <span class="deadline-countdown ${item.status === 'missing' ? 'urgent' : ''}">${item.status}</span>
      `;
      selectedDateList.appendChild(el);
    });
  }

  prevBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
  });

  nextBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
  });

  (async function init() {
    calendarItems = await loadCalendarHomework();
    renderCalendar();
    renderSelectedDate();
  })();
})();

// ===== Deadline Tracker =====
(function initDeadlineTracker() {
  const groupOverdue = document.querySelector('#group-overdue .deadline-group-list');
  if (!groupOverdue) return; // not on this page

  const groupToday = document.querySelector('#group-today .deadline-group-list');
  const groupWeek = document.querySelector('#group-week .deadline-group-list');
  const groupLater = document.querySelector('#group-later .deadline-group-list');
  const emptyState = document.getElementById('deadlines-empty-state');

  async function loadDeadlineHomework() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabaseClient
      .from('homework')
      .select('*')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .is('archived_at', null)
      .is('completed_at', null)
      .order('due_at', { ascending: true });

    if (error) {
      console.error('Error loading deadlines:', error);
      return [];
    }

    return data.map(row => ({
      title: row.title,
      subject: row.subject || 'General',
      status: getRowStatus(row),
      dueDate: new Date(row.due_at),
    }));
  }

  function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function buildDeadlineItem(item) {
    const now = new Date();
    const diffMs = item.dueDate - now;
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    const urgent = item.status === 'missing' || diffHours <= 24;

    let countdownLabel;
    if (item.status === 'missing') {
      countdownLabel = 'Overdue';
    } else if (diffHours <= 0) {
      countdownLabel = 'Due now';
    } else if (diffHours < 24) {
      countdownLabel = `Due in ${diffHours}h`;
    } else {
      countdownLabel = `Due in ${Math.round(diffHours / 24)}d`;
    }

    const el = document.createElement('div');
    el.className = 'deadline-item';
    el.innerHTML = `
      <div class="deadline-item-info">
        <h4>${item.title}</h4>
        <p>${item.subject} &middot; ${item.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
      </div>
      <span class="deadline-countdown ${urgent ? 'urgent' : ''}">${countdownLabel}</span>
    `;
    return el;
  }

  async function renderDeadlineGroups() {
    const items = (await loadDeadlineHomework()).filter(i => i.status === 'pending' || i.status === 'missing');

    const today = startOfDay(new Date());
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);

    const buckets = { overdue: [], today: [], week: [], later: [] };

    items.forEach(item => {
      if (item.status === 'missing') {
        buckets.overdue.push(item);
      } else if (item.dueDate < tomorrow) {
        buckets.today.push(item);
      } else if (item.dueDate < weekEnd) {
        buckets.week.push(item);
      } else {
        buckets.later.push(item);
      }
    });

    [groupOverdue, groupToday, groupWeek, groupLater].forEach(el => el.innerHTML = '');

    buckets.overdue.sort((a, b) => a.dueDate - b.dueDate).forEach(item => groupOverdue.appendChild(buildDeadlineItem(item)));
    buckets.today.sort((a, b) => a.dueDate - b.dueDate).forEach(item => groupToday.appendChild(buildDeadlineItem(item)));
    buckets.week.sort((a, b) => a.dueDate - b.dueDate).forEach(item => groupWeek.appendChild(buildDeadlineItem(item)));
    buckets.later.sort((a, b) => a.dueDate - b.dueDate).forEach(item => groupLater.appendChild(buildDeadlineItem(item)));

    document.getElementById('group-overdue').classList.toggle('empty-group', buckets.overdue.length === 0);
    document.getElementById('group-today').classList.toggle('empty-group', buckets.today.length === 0);
    document.getElementById('group-week').classList.toggle('empty-group', buckets.week.length === 0);
    document.getElementById('group-later').classList.toggle('empty-group', buckets.later.length === 0);

    emptyState.hidden = items.length !== 0;
  }

  renderDeadlineGroups();
})();

// ===== Settings: Profile Form =====
const profileForm = document.getElementById('profile-form');

profileForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('display-name');
  const timezone = document.getElementById('timezone');
  const successEl = document.getElementById('profile-success');

  document.querySelectorAll('#profile-form .field-error').forEach(el => el.hidden = true);

  if (!name.value.trim()) {
    document.getElementById('display-name-error').hidden = false;
    name.closest('.form-group').classList.add('shake');
    setTimeout(() => name.closest('.form-group').classList.remove('shake'), 300);
    return;
  }

  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  const { error } = await supabaseClient
    .from('profiles')
    .update({ display_name: name.value.trim(), timezone: timezone.value })
    .eq('id', user.id);

  if (error) {
    console.error('Error updating profile:', error);
    return;
  }

  successEl.hidden = false;
  setTimeout(() => { successEl.hidden = true; }, 3000);
});

// ===== Settings: Reminders Toggle =====
const remindersToggle = document.getElementById('reminders-enabled');

remindersToggle?.addEventListener('change', async () => {
  const successEl = document.getElementById('reminders-success');

  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  const { error } = await supabaseClient
    .from('profiles')
    .update({ reminders_enabled: remindersToggle.checked })
    .eq('id', user.id);

  if (error) {
    console.error('Error updating reminders:', error);
    return;
  }

  successEl.hidden = false;
  setTimeout(() => { successEl.hidden = true; }, 3000);
});

// ===== Settings: Change Password Form =====
const passwordForm = document.getElementById('password-form');

passwordForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const current = document.getElementById('current-password');
  const newPass = document.getElementById('new-password');
  const confirm = document.getElementById('confirm-new-password');
  const successEl = document.getElementById('password-success');
  let isValid = true;

  document.querySelectorAll('#password-form .field-error').forEach(el => el.hidden = true);
  document.querySelectorAll('#password-form .form-group').forEach(el => el.classList.remove('shake'));

  const currentPasswordVisible = current.closest('.form-group').style.display !== 'none';
if (currentPasswordVisible && !current.value) {
  document.getElementById('current-password-error').hidden = false;
  current.closest('.form-group').classList.add('shake');
  isValid = false;
}
  if (newPass.value.length < 8) {
    document.getElementById('new-password-error').hidden = false;
    newPass.closest('.form-group').classList.add('shake');
    isValid = false;
  }
  if (confirm.value !== newPass.value) {
    document.getElementById('confirm-new-password-error').hidden = false;
    confirm.closest('.form-group').classList.add('shake');
    isValid = false;
  }

  if (!isValid) return;

const isRecoveryFlow = document.getElementById('current-password').closest('.form-group').style.display === 'none';

if (!isRecoveryFlow) {
  // Re-verify current password by attempting a sign-in with it
  const { data: { user } } = await supabaseClient.auth.getUser();
  const { error: verifyError } = await supabaseClient.auth.signInWithPassword({
    email: user.email,
    password: current.value,
  });

  if (verifyError) {
    document.getElementById('current-password-error').textContent = 'Current password is incorrect.';
    document.getElementById('current-password-error').hidden = false;
    current.closest('.form-group').classList.add('shake');
    return;
  }
}

const { error } = await supabaseClient.auth.updateUser({ password: newPass.value });
  if (error) {
    console.error('Error updating password:', error);
    return;
  }

  successEl.hidden = false;
  passwordForm.reset();
  setTimeout(() => { successEl.hidden = true; }, 3000);
});

// ===== Settings: Delete Account =====
const deleteBtn = document.getElementById('delete-account-btn');
const deleteModal = document.getElementById('delete-modal-overlay');
const deleteConfirmInput = document.getElementById('delete-confirm-input');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');

deleteBtn?.addEventListener('click', () => {
  deleteModal.hidden = false;
  deleteConfirmInput.value = '';
  confirmDeleteBtn.disabled = true;
  deleteConfirmInput.focus();
});

cancelDeleteBtn?.addEventListener('click', () => {
  deleteModal.hidden = true;
});

deleteModal?.addEventListener('click', (e) => {
  if (e.target === deleteModal) deleteModal.hidden = true;
});

deleteConfirmInput?.addEventListener('input', () => {
  confirmDeleteBtn.disabled = deleteConfirmInput.value !== 'DELETE';
});

confirmDeleteBtn?.addEventListener('click', async () => {
  confirmDeleteBtn.disabled = true;
  confirmDeleteBtn.textContent = 'Deleting...';

  const { data: { session } } = await supabaseClient.auth.getSession();

  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
  });

  const result = await response.json();

  if (!response.ok) {
    console.error('Error deleting account:', result.error);
    confirmDeleteBtn.disabled = false;
    confirmDeleteBtn.textContent = 'Delete Account';
    alert('Something went wrong deleting your account. Please try again.');
    return;
  }

  await supabaseClient.auth.signOut();
  deleteModal.hidden = true;
  window.location.href = 'login.html';
});

// ===== Settings: Pre-fill Profile Form =====
(async function loadProfileSettings() {
  const nameInput = document.getElementById('display-name');
  if (!nameInput) return; // not on this page

  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  document.getElementById('email').value = user.email;

  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('display_name, timezone, reminders_enabled')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('Error loading profile:', error);
    return;
  }

  nameInput.value = profile.display_name || '';
  document.getElementById('timezone').value = profile.timezone || 'Asia/Manila';

  const remindersToggleEl = document.getElementById('reminders-enabled');
  if (remindersToggleEl) remindersToggleEl.checked = profile.reminders_enabled;
})();

// ===== Route Protection =====
const PUBLIC_PAGES = ['login.html', 'register.html', 'reset-password.html'];

async function checkAuth() {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (!session && !PUBLIC_PAGES.includes(currentPage)) {
    window.location.href = 'login.html';
    return null;
  }

  if (session && PUBLIC_PAGES.includes(currentPage)) {
    window.location.href = 'index.html';
    return session;
  }

  if (session) {
    const profileLink = document.querySelector('.profile-link');
    if (profileLink) {
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('display_name')
        .eq('id', session.user.id)
        .single();

      profileLink.textContent = profile?.display_name || session.user.email;
    }
  }

  return session;
}

checkAuth();

// ===== Sidebar Log Out =====
document.querySelectorAll('.sidebar-footer a').forEach(link => {
  link.addEventListener('click', async (e) => {
    e.preventDefault();
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
  });
});

// ===== Detect Password Recovery Session =====
(async function handlePasswordRecovery() {
  const passwordFormEl = document.getElementById('password-form');
  if (!passwordFormEl) return; // not on this page

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      // Hide the "current password" requirement for this special flow
      const currentPasswordGroup = document.getElementById('current-password').closest('.form-group');
      if (currentPasswordGroup) {
        currentPasswordGroup.style.display = 'none';
        document.getElementById('current-password').required = false;
      }

      // Update heading/messaging to reflect recovery context
      const cardTitle = passwordFormEl.closest('.settings-card').querySelector('h2');
      if (cardTitle) cardTitle.textContent = 'Set a New Password';
    }
  });
})();
