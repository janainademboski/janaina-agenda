// --- Config ---
const API_URL = 'https://script.google.com/macros/s/AKfycbxhjzTdfHmicwKpYiZ321kBZkz3F5GOuvOzNNR8Nw37e-Shd6nZ6q-Nb3gwqCjMIh3uPg/exec';

// --- State ---
let slots        = [];
let selectedSlot = null;
let adminPass    = sessionStorage.getItem('jana-admin-pass') || ''; // Fix 2: persist session

// --- Portuguese labels ---
const MONTHS       = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const DAYS_FULL    = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
const DAY_SHORT    = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

// --- API helper: all requests via GET params to avoid CORS ---
async function api(params) {
  const url = API_URL + '?' + new URLSearchParams(params).toString();
  const res  = await fetch(url, { redirect: 'follow' });
  return res.json();
}

// --- Theme ---
function setTheme(t, btn) {
  document.documentElement.setAttribute('data-theme', t);
  document.querySelectorAll('.tbtn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  localStorage.setItem('jana-theme', t);
}

// --- Fix 1: Detect system theme on first visit ---
function initTheme() {
  const saved = localStorage.getItem('jana-theme');
  let theme;
  if (saved) {
    theme = saved;
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    theme = prefersDark ? 'dark' : 'warm';
  }
  document.documentElement.setAttribute('data-theme', theme);
  // --- Fix 2: Remove active from ALL buttons first, then set correct one ---
  document.querySelectorAll('.tbtn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.tbtn[data-theme="${theme}"]`);
  if (btn) btn.classList.add('active');
}

// --- Fix 2: Restore admin session on page load ---
function restoreAdminSession() {
  if (!adminPass) return;
  api({ action: 'adminGetBookings', password: adminPass }).then(data => {
    if (data.success) {
      document.getElementById('adminLogin').style.display   = 'none';
      document.getElementById('adminContent').style.display = 'block';
      // --- Fix 3: Re-open panel if it was open before refresh ---
      const wasOpen = sessionStorage.getItem('jana-admin-open') === 'true';
      if (wasOpen) {
        document.getElementById('adminPanel').classList.add('open');
        renderAdminBookings(data.bookings);
        renderAdminSlots();
      }
    } else {
      sessionStorage.removeItem('jana-admin-pass');
      sessionStorage.removeItem('jana-admin-open');
      adminPass = '';
    }
  }).catch(() => {});
}

// --- Populate time dropdown with 15min intervals ---
function populateTimeDropdown() {
  const select = document.getElementById('newSlotTime');
  select.innerHTML = '<option value="">Selecione...</option>';
  for (let h = 6; h < 23; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hh  = String(h).padStart(2, '0');
      const mm  = String(m).padStart(2, '0');
      const val = `${hh}:${mm}`;
      const lbl = `${hh}h${mm === '00' ? '' : mm}`;
      select.innerHTML += `<option value="${val}">${lbl}</option>`;
    }
  }
}

// --- Auto-fill Day and ID when date changes ---
function onSlotDateChange() {
  const dateVal = document.getElementById('newSlotDate').value;
  if (!dateVal) {
    document.getElementById('newSlotDay').value = '';
    document.getElementById('newSlotId').value  = '';
    return;
  }
  const d       = parseDate(dateVal);
  const dayName = DAYS_FULL[d.getDay()].split('-')[0]; // "Terça" from "Terça-feira"
  document.getElementById('newSlotDay').value = dayName;
  updateSlotId();
}

// --- Auto-fill ID when time changes ---
function onSlotTimeChange() { updateSlotId(); }

// --- Generate unique ID from date + time ---
function updateSlotId() {
  const dateVal = document.getElementById('newSlotDate').value;
  const timeVal = document.getElementById('newSlotTime').value;
  if (!dateVal || !timeVal) {
    document.getElementById('newSlotId').value = '';
    return;
  }
  const timeClean = timeVal.replace(':', 'h').replace('h00', 'h');
  document.getElementById('newSlotId').value = `${dateVal}-${timeClean}`;
}

// --- Format time value for display (e.g. "20:00" → "20h") ---
function formatTimeDisplay(timeVal) {
  if (!timeVal) return '';
  const [h, m] = timeVal.split(':');
  return m === '00' ? `${h}h` : `${h}h${m}`;
}
window.addEventListener('scroll', () => {
  document.getElementById('themeBar').classList.toggle('scrolled', window.scrollY > 8);
}, { passive: true });

// --- Init ---
initTheme();
loadSlots();
restoreAdminSession();
populateTimeDropdown();
initDatePicker();

// --- Set min date on date picker to today ---
function initDatePicker() {
  const today  = new Date();
  const yyyy   = today.getFullYear();
  const mm     = String(today.getMonth() + 1).padStart(2, '0');
  const dd     = String(today.getDate()).padStart(2, '0');
  const minVal = `${yyyy}-${mm}-${dd}`;
  const picker = document.getElementById('newSlotDate');
  if (picker) picker.min = minVal;
}

// --- Load slots ---
async function loadSlots() {
  try {
    const data = await api({ action: 'getSlots' });
    const now   = new Date();
    const today = new Date(); today.setHours(0,0,0,0);
    slots = (data.slots || [])
      .filter(s => {
        const d = parseDate(s.date);
        if (!d || d < today) return false; // --- Hide past dates ---
        // --- If today, check if time has passed ---
        if (d.getTime() === today.getTime()) {
          const timeParts = s.time.match(/^(\d{1,2})h(\d{0,2})/);
          if (timeParts) {
            const slotHour = parseInt(timeParts[1]);
            const slotMin  = parseInt(timeParts[2] || 0);
            const slotDate = new Date(d);
            slotDate.setHours(slotHour, slotMin, 0, 0);
            if (slotDate <= now) return false; // --- Hide past times today ---
          }
        }
        return true;
      })
      .sort((a, b) => {
        const da = parseDate(a.date), db = parseDate(b.date);
        if (!da) return 1; if (!db) return -1;
        if (da - db !== 0) return da - db;
        return (a.time || '').localeCompare(b.time || '');
      });
    renderCalendar();
    // --- Re-render admin slots if already logged in ---
    if (adminPass && document.getElementById('adminContent').style.display === 'block') {
      renderAdminSlots();
    }
  } catch(e) {
    document.getElementById('calendarContainer').innerHTML =
      `<div class="empty-state">Não foi possível carregar os horários. Tente novamente.</div>`;
  }
}

// --- Parse date safely as local (avoids UTC timezone shift) ---
function parseDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

// --- Get Monday of week ---
function getMonday(d) {
  const date = new Date(d);
  const dow  = date.getDay();
  const diff = (dow === 0) ? -6 : 1 - dow;
  date.setDate(date.getDate() + diff);
  return date;
}

// --- Format week label ---
function formatWeekLabel(monday) {
  const sat = new Date(monday);
  sat.setDate(monday.getDate() + 5);
  const d1 = monday.getDate(), m1 = monday.getMonth(), y1 = monday.getFullYear();
  const d2 = sat.getDate(), m2 = sat.getMonth();
  if (m1 === m2 && y1 === sat.getFullYear())
    return `${d1} – ${d2} de ${MONTHS[m1]} de ${y1}`;
  return `${d1} ${MONTHS_SHORT[m1]} – ${d2} ${MONTHS_SHORT[m2]} ${sat.getFullYear()}`;
}

// --- Render calendar ---
function renderCalendar() {
  const container = document.getElementById('calendarContainer');
  if (!slots.length) {
    container.innerHTML = `<div class="empty-state">Nenhum horário disponível no momento.</div>`;
    return;
  }

  // --- Group slots by week ---
  const weekMap = new Map();
  slots.forEach(slot => {
    const d = parseDate(slot.date);
    if (!d) return;
    const mon = getMonday(d);
    const key = `${mon.getFullYear()}-${String(mon.getMonth()).padStart(2,'0')}-${String(mon.getDate()).padStart(2,'0')}`;
    if (!weekMap.has(key)) weekMap.set(key, { monday: mon, slots: [] });
    weekMap.get(key).slots.push({ ...slot, parsedDate: d });
  });

  if (!weekMap.size) {
    container.innerHTML = `<div class="empty-state">Adicione datas aos horários na planilha (coluna E, formato YYYY-MM-DD).</div>`;
    return;
  }

  const COL_DAYS = [1, 2, 3, 4, 5, 6]; // Mon–Sat
  let html = '';

  weekMap.forEach(({ monday, slots: wSlots }) => {
    html += `<div class="week-block"><div class="week-header">Semana de ${formatWeekLabel(monday)}</div><div class="calendar-grid">`;

    COL_DAYS.forEach(dow => {
      const cellDate = new Date(monday);
      cellDate.setDate(monday.getDate() + (dow - 1));

      const daySlots = wSlots.filter(s =>
        s.parsedDate.getFullYear() === cellDate.getFullYear() &&
        s.parsedDate.getMonth()    === cellDate.getMonth()    &&
        s.parsedDate.getDate()     === cellDate.getDate()
      );

      const dayLabel = DAY_SHORT[dow];
      const dateNum  = cellDate.getDate();
      const monthStr = MONTHS_SHORT[cellDate.getMonth()];
      if (daySlots.length) {
        html += `<div class="day-cell has-slots">
          <div class="day-info">
            <div class="day-name">${dayLabel}</div>
            <div class="day-date-num">${dateNum}</div>
            <div class="day-month">${monthStr}</div>
          </div>`;

        daySlots.forEach(slot => {
          const isBooked   = slot.status === 'booked';
          const isSelected = selectedSlot && selectedSlot.id === slot.id;
          const cls        = isBooked ? 'booked' : isSelected ? 'selected' : 'available';
          const statusTxt  = isBooked ? 'Reservado' : isSelected ? 'Selecionado' : 'Livre';
          const click      = isBooked ? '' : `onclick="selectSlot('${slot.id}')"`;
          html += `<button class="slot-btn ${cls}" ${click}>
            <span class="slot-time-label">${slot.time}</span>
            <span class="slot-status-label">${statusTxt}</span>
          </button>`;
        });

        html += `</div>`;
      } else {
        html += `<div class="day-cell empty">
          <div class="day-info">
            <div class="day-name">${dayLabel}</div>
            <div class="day-date-num">${dateNum}</div>
            <div class="day-month">${monthStr}</div>
          </div>
        </div>`;
      }
    });

    html += `</div></div>`;
  });

  container.innerHTML = html;
}

// --- Select slot ---
function selectSlot(id) {
  selectedSlot = slots.find(s => s.id === id) || null;
  renderCalendar();

  const form = document.getElementById('bookingForm');
  if (selectedSlot) {
    const d   = parseDate(selectedSlot.date);
    const lbl = d
      ? `${DAYS_FULL[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()} · ${selectedSlot.time}`
      : `${selectedSlot.day} · ${selectedSlot.time}`;
    form.style.display = 'block';
    document.getElementById('selectedSlotInfo').textContent = lbl;
    setTimeout(() => form.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  } else {
    form.style.display = 'none';
  }
}

// --- Reset booking form for a new booking ---
function resetBooking() {
  document.getElementById('successScreen').style.display = 'none';
  document.getElementById('bookingForm').style.display   = 'none';
  selectedSlot = null;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- Validation ---
function validateName() {
  const input = document.getElementById('fieldName');
  const err   = document.getElementById('errName');
  const val   = input.value.trim();
  const valid = /^[A-Za-zÀ-ÖØ-öø-ÿ]{2,}(\s+[A-Za-zÀ-ÖØ-öø-ÿ]{2,})+$/.test(val);
  input.classList.toggle('invalid', !valid && val.length > 0);
  input.classList.toggle('valid',    valid);
  err.classList.toggle('show',      !valid && val.length > 0);
  return valid;
}

function validateWhatsapp() {
  const input  = document.getElementById('fieldWhatsapp');
  const err    = document.getElementById('errWhatsapp');
  const digits = input.value.replace(/\D/g, '');
  const valid  = digits.length >= 10 && digits.length <= 11;
  input.classList.toggle('invalid', !valid && input.value.length > 0);
  input.classList.toggle('valid',    valid);
  err.classList.toggle('show',      !valid && input.value.length > 0);
  return valid;
}

function validateEmail() {
  const input = document.getElementById('fieldEmail');
  const err   = document.getElementById('errEmail');
  const val   = input.value.trim();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val);
  input.classList.toggle('invalid', !valid && val.length > 0);
  input.classList.toggle('valid',    valid);
  err.classList.toggle('show',      !valid && val.length > 0);
  return valid;
}

// --- Submit booking ---
async function submitBooking() {
  const name     = document.getElementById('fieldName').value.trim();
  const whatsapp = document.getElementById('fieldWhatsapp').value.trim();
  const email    = document.getElementById('fieldEmail').value.trim();
  const message  = document.getElementById('fieldMessage').value.trim();
  const msgEl    = document.getElementById('formMessage');
  const btn      = document.getElementById('btnSubmit');

  msgEl.className = 'message'; msgEl.style.display = 'none';

  if (!selectedSlot) { showMsg(msgEl, 'error', 'Selecione um horário.'); return; }

  const nameOk  = validateName();
  const phoneOk = validateWhatsapp();
  const emailOk = validateEmail();

  if (!nameOk)  { showMsg(msgEl, 'error', 'Informe seu nome completo (nome e sobrenome).'); return; }
  if (!phoneOk) { showMsg(msgEl, 'error', 'Informe um número de WhatsApp válido.'); return; }
  if (!emailOk) { showMsg(msgEl, 'error', 'Informe um e-mail válido.'); return; }

  btn.disabled = true; btn.textContent = 'Confirmando...';

  try {
    const data = await api({
      action: 'bookSlot',
      slotId: selectedSlot.id,
      name, whatsapp, email, message
    });

    if (data.success) {
      // --- Reset form fields ---
      document.getElementById('fieldName').value     = '';
      document.getElementById('fieldWhatsapp').value = '';
      document.getElementById('fieldEmail').value    = '';
      document.getElementById('fieldMessage').value  = '';
      document.getElementById('fieldName').classList.remove('valid', 'invalid');
      document.getElementById('fieldWhatsapp').classList.remove('valid', 'invalid');
      document.getElementById('fieldEmail').classList.remove('valid', 'invalid');
      document.getElementById('formMessage').style.display = 'none';
      btn.disabled = false; btn.textContent = 'Confirmar agendamento';

      document.getElementById('bookingForm').style.display   = 'none';
      document.getElementById('successScreen').style.display = 'block';
      document.getElementById('successScreen').scrollIntoView({ behavior: 'smooth' });
      const s = slots.find(s => s.id === selectedSlot.id);
      if (s) s.status = 'booked';
      selectedSlot = null;
      renderCalendar();
    } else {
      showMsg(msgEl, 'error', data.error === 'Slot already booked.'
        ? 'Este horário já foi reservado. Escolha outro.'
        : 'Erro ao reservar. Tente novamente.');
      btn.disabled = false; btn.textContent = 'Confirmar agendamento';
    }
  } catch(e) {
    showMsg(msgEl, 'error', 'Erro de conexão. Tente novamente.');
    btn.disabled = false; btn.textContent = 'Confirmar agendamento';
  }
}

// --- Admin ---
function toggleAdmin() {
  const panel = document.getElementById('adminPanel');
  panel.classList.toggle('open');
  const isOpen = panel.classList.contains('open');

  // --- Fix 3: Save open state ---
  sessionStorage.setItem('jana-admin-open', isOpen);

  // --- Fix 2: If session exists and panel just opened, restore UI ---
  if (isOpen && adminPass) {
    initDatePicker();
    api({ action: 'adminGetBookings', password: adminPass }).then(data => {
      if (data.success) {
        document.getElementById('adminLogin').style.display   = 'none';
        document.getElementById('adminContent').style.display = 'block';
        renderAdminBookings(data.bookings);
        renderAdminSlots();
      }
    }).catch(() => {});
  }
}

async function adminAuth() {
  const pw    = document.getElementById('adminPassword').value;
  const msgEl = document.getElementById('adminLoginMsg');
  try {
    const data = await api({ action: 'adminGetBookings', password: pw });
    if (data.success) {
      // --- Fix 2: Save session so refresh doesn't log out ---
      adminPass = pw;
      sessionStorage.setItem('jana-admin-pass', pw);
      sessionStorage.setItem('jana-admin-open', 'true');
      document.getElementById('adminLogin').style.display   = 'none';
      document.getElementById('adminContent').style.display = 'block';
      renderAdminBookings(data.bookings);
      renderAdminSlots();
    } else { showMsg(msgEl, 'error', 'Senha incorreta.'); }
  } catch(e) { showMsg(msgEl, 'error', 'Erro de conexão.'); }
}

function renderAdminSlots() {
  const el = document.getElementById('adminSlotsList');
  if (!slots.length) { el.innerHTML = '<p style="font-size:13px;color:var(--muted);">Nenhum horário cadastrado.</p>'; return; }
  el.innerHTML = slots.map(slot => {
    const d   = parseDate(slot.date);
    const lbl = d
      ? `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()} · ${slot.time}`
      : `${slot.day} · ${slot.time}`;
    return `
      <div class="admin-slot-row" id="row-${slot.id}">
        <span class="admin-slot-label"><strong>${slot.day}</strong> — ${lbl}</span>
        <span class="slot-status-pill ${slot.status}">${slot.status === 'available' ? 'Livre' : 'Reservado'}</span>
        <div class="admin-slot-actions">
          <button class="btn-small ${slot.status === 'available' ? 'danger' : 'success-btn'}"
                  onclick="toggleSlotStatus('${slot.id}','${slot.status}')">
            ${slot.status === 'available' ? 'Bloquear' : 'Liberar'}
          </button>
          <button class="btn-icon btn-edit" title="Editar" onclick="startEditSlot('${slot.id}')">✏️</button>
          <button class="btn-icon btn-delete" title="Deletar" onclick="startDeleteSlot('${slot.id}')">🗑️</button>
        </div>
      </div>`;
  }).join('');
}

// --- Generate time options with current selected ---
function getTimeOptions(selectedVal) {
  let html = '<option value="">Selecione...</option>';
  for (let h = 6; h < 23; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hh  = String(h).padStart(2, '0');
      const mm  = String(m).padStart(2, '0');
      const val = `${hh}:${mm}`;
      const lbl = `${hh}h${mm === '00' ? '' : mm}`;
      const sel = val === selectedVal ? 'selected' : '';
      html += `<option value="${val}" ${sel}>${lbl}</option>`;
    }
  }
  return html;
}

// --- Start inline edit ---
function startEditSlot(id) {
  const slot = slots.find(s => s.id === id);
  if (!slot) return;
  const dateVal = slot.date || '';
  // --- Convert display time back to HH:MM for select ---
  let timeVal = slot.time.replace('h', ':');
  if (!timeVal.includes(':')) timeVal += ':00';
  if (timeVal.split(':')[0].length === 1) timeVal = '0' + timeVal;
  if (timeVal.split(':')[1] === undefined || timeVal.split(':')[1] === '') timeVal += '00';

  const today  = new Date();
  const minVal = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  const row = document.getElementById(`row-${id}`);
  row.innerHTML = `
    <div class="admin-edit-row">
      <input type="date" id="edit-date-${id}" value="${dateVal}" min="${minVal}" onchange="onEditDateChange('${id}')"/>
      <select id="edit-time-${id}" onchange="onEditDateChange('${id}')">${getTimeOptions(timeVal)}</select>
      <input type="text" id="edit-day-${id}"  value="${slot.day}" disabled/>
      <input type="text" id="edit-id-${id}"   value="${id}" disabled style="font-size:10px;"/>
      <button class="btn-small success-btn" onclick="saveEditSlot('${id}')">✓ Salvar</button>
      <button class="btn-small" style="background:var(--muted)" onclick="renderAdminSlots()">✗ Cancelar</button>
    </div>`;
}

// --- Auto-update day and ID when edit date/time changes ---
function onEditDateChange(id) {
  const dateVal = document.getElementById(`edit-date-${id}`).value;
  const timeEl  = document.getElementById(`edit-time-${id}`);
  const timeVal = timeEl ? timeEl.value : '';
  if (!dateVal) return;
  const d       = parseDate(dateVal);
  const dayName = DAYS_FULL[d.getDay()].split('-')[0];
  document.getElementById(`edit-day-${id}`).value = dayName;
  if (timeVal) {
    document.getElementById(`edit-id-${id}`).value = `${dateVal}-${formatTimeDisplay(timeVal)}`;
  }
}

// --- Save inline edit ---
async function saveEditSlot(oldId) {
  const dateVal = document.getElementById(`edit-date-${oldId}`).value;
  const timeVal = document.getElementById(`edit-time-${oldId}`).value;
  if (!dateVal || !timeVal) { alert('Selecione data e horário.'); return; }

  // --- Validate date is not in the past ---
  const selectedDate = parseDate(dateVal);
  const now          = new Date();
  const today        = new Date(); today.setHours(0,0,0,0);
  if (selectedDate < today) {
    alert('Não é possível editar para uma data passada.');
    return;
  }
  if (selectedDate.getTime() === today.getTime()) {
    const [hh, mm] = timeVal.split(':').map(Number);
    const slotTime = new Date(); slotTime.setHours(hh, mm, 0, 0);
    if (slotTime <= now) {
      alert('Este horário já passou hoje. Escolha um horário futuro.');
      return;
    }
  }

  const newTime = formatTimeDisplay(timeVal);
  const d       = parseDate(dateVal);
  const newDay  = DAYS_FULL[d.getDay()].split('-')[0];
  const newId   = `${dateVal}-${newTime}`;

  const btn = event.target;
  btn.disabled = true; btn.textContent = 'Salvando...';

  try {
    const data = await api({
      action: 'adminEditSlot', password: adminPass,
      oldId, newId, newDay, newTime, newDate: dateVal
    });
    if (data.success) {
      const s = slots.find(s => s.id === oldId);
      if (s) { s.id = newId; s.day = newDay; s.time = newTime; s.date = dateVal; }
      renderCalendar();
      renderAdminSlots();
    } else { alert(data.error || 'Erro ao editar.'); btn.disabled = false; btn.textContent = '✓ Salvar'; }
  } catch(e) { alert('Erro de conexão.'); btn.disabled = false; btn.textContent = '✓ Salvar'; }
}

// --- Start inline delete confirmation ---
function startDeleteSlot(id) {
  const slot = slots.find(s => s.id === id);
  if (!slot) return;
  const d   = parseDate(slot.date);
  const lbl = d ? `${d.getDate()} de ${MONTHS[d.getMonth()]} · ${slot.time}` : slot.time;
  const row = document.getElementById(`row-${id}`);
  row.innerHTML = `
    <span style="font-size:13px;color:var(--error);">Deletar <strong>${slot.day} — ${lbl}</strong>? Não pode ser desfeito.</span>
    <div class="admin-slot-actions">
      <button class="btn-small danger" onclick="confirmDeleteSlot('${id}')">Sim, deletar</button>
      <button class="btn-small" style="background:var(--muted)" onclick="renderAdminSlots()">Cancelar</button>
    </div>`;
}

// --- Confirm and execute delete ---
async function confirmDeleteSlot(id) {
  const btn = event.target;
  btn.disabled = true; btn.textContent = 'Deletando...';
  try {
    const data = await api({ action: 'adminDeleteSlot', password: adminPass, slotId: id });
    if (data.success) {
      slots = slots.filter(s => s.id !== id);
      renderCalendar();
      renderAdminSlots();
    } else { alert(data.error || 'Erro ao deletar.'); btn.disabled = false; btn.textContent = 'Sim, deletar'; }
  } catch(e) { alert('Erro de conexão.'); btn.disabled = false; btn.textContent = 'Sim, deletar'; }
}

function formatTimestamp(ts) {
  if (!ts) return '—';
  const s = String(ts).trim();
  // --- ISO format: 2026-03-26T16:58:25.000Z ---
  if (s.includes('T') || s.includes('Z')) {
    const d = new Date(s);
    if (!isNaN(d)) {
      return d.toLocaleString('pt-BR', {
        timeZone  : 'America/Sao_Paulo',
        day       : '2-digit',
        month     : '2-digit',
        year      : 'numeric',
        hour      : '2-digit',
        minute    : '2-digit'
      });
    }
  }
  // --- Already formatted (26/03/2026, 14:08) --- return as-is
  return s;
}

function renderAdminBookings(bookings) {
  const el = document.getElementById('adminBookingsList');
  if (!bookings.length) {
    el.innerHTML = '<p style="font-size:13px;color:var(--muted);font-weight:300;">Nenhum agendamento ainda.</p>';
    return;
  }
  // --- Newest first ---
  const sorted = [...bookings].reverse();
  el.innerHTML = sorted.map(b => `
    <div class="booking-row">
      <div class="booking-slot-id">${b.slotId}</div>
      <div class="booking-details">
        <strong>${b.name}</strong><br/>
        📱 ${b.whatsapp}<br/>
        ✉️ ${b.email}<br/>
        ${b.message ? `💬 ${b.message}<br/>` : ''}
        <span style="font-size:11px;color:var(--muted);">${formatTimestamp(b.timestamp)}</span>
      </div>
    </div>`).join('');
}

async function toggleSlotStatus(id, currentStatus) {
  // --- Fix 3: Prevent double-click ---
  const btn = event.target;
  btn.disabled    = true;
  btn.textContent = 'Processando...';

  const newStatus = currentStatus === 'available' ? 'booked' : 'available';
  try {
    const data = await api({ action: 'adminUpdateSlot', password: adminPass, slotId: id, status: newStatus });
    if (data.success) {
      const s = slots.find(s => s.id === id);
      if (s) s.status = newStatus;
      renderCalendar();
      renderAdminSlots();
    } else {
      btn.disabled    = false;
      btn.textContent = currentStatus === 'available' ? 'Bloquear' : 'Liberar';
    }
  } catch(e) {
    alert('Erro ao atualizar horário.');
    btn.disabled    = false;
    btn.textContent = currentStatus === 'available' ? 'Bloquear' : 'Liberar';
  }
}

async function addSlot() {
  const date    = document.getElementById('newSlotDate').value.trim();
  const timeVal = document.getElementById('newSlotTime').value.trim();
  const day     = document.getElementById('newSlotDay').value.trim();
  const id      = document.getElementById('newSlotId').value.trim();
  const msgEl   = document.getElementById('addSlotMsg');
  const btn     = event.target;

  if (!date || !timeVal) { showMsg(msgEl, 'error', 'Selecione a data e o horário.'); return; }

  // --- Validate date is not in the past ---
  const selectedDate = parseDate(date);
  const now          = new Date();
  const today        = new Date(); today.setHours(0,0,0,0);
  if (selectedDate < today) {
    showMsg(msgEl, 'error', 'Não é possível adicionar horários em datas passadas.');
    return;
  }
  // --- If today, check time hasn't passed ---
  if (selectedDate.getTime() === today.getTime()) {
    const [hh, mm]  = timeVal.split(':').map(Number);
    const slotTime  = new Date(); slotTime.setHours(hh, mm, 0, 0);
    if (slotTime <= now) {
      showMsg(msgEl, 'error', 'Este horário já passou hoje. Escolha um horário futuro.');
      return;
    }
  }

  // --- Format time for display (20:00 → 20h, 20:30 → 20h30) ---
  const time = formatTimeDisplay(timeVal);

  // --- Fix 3: Prevent double-click ---
  btn.disabled    = true;
  btn.textContent = 'Processando...';

  try {
    const data = await api({ action: 'adminAddSlot', password: adminPass, id, day, time, date });
    if (data.success) {
      slots.push({ id, day, time, date, status: 'available' });
      slots.sort((a, b) => {
        const da = parseDate(a.date), db = parseDate(b.date);
        if (!da) return 1; if (!db) return -1;
        if (da - db !== 0) return da - db;
        return (a.time || '').localeCompare(b.time || '');
      });
      renderCalendar();
      renderAdminSlots();
      document.getElementById('newSlotDate').value = '';
      document.getElementById('newSlotTime').value = '';
      document.getElementById('newSlotDay').value  = '';
      document.getElementById('newSlotId').value   = '';
      showMsg(msgEl, 'success', 'Horário adicionado!');
    } else { showMsg(msgEl, 'error', data.error || 'Erro ao adicionar.'); }
  } catch(e) { showMsg(msgEl, 'error', 'Erro de conexão.'); }
  finally {
    btn.disabled    = false;
    btn.textContent = '+ Adicionar horário';
  }
}

// --- Helper ---
function showMsg(el, type, text) {
  el.className     = `message ${type}`;
  el.textContent   = text;
  el.style.display = 'block';
}