// --- Config ---
const API_URL        = 'https://script.google.com/macros/s/AKfycbx_RVF-_Gz1D6aYLd54aVnuVtYea4DMtgqHaZnpOcdBPd_tpAnA33sifXjyFR24cBAR2g/exec';
const CALLMEBOT_PHONE = '5561992849023';
const CALLMEBOT_KEY   = 'YOUR_CALLMEBOT_KEY';

// --- State ---
let slots        = [];
let selectedSlot = null;
let adminPass    = '';

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

function initTheme() {
  const saved = localStorage.getItem('jana-theme') || 'warm';
  document.documentElement.setAttribute('data-theme', saved);
  const btn = document.querySelector(`.tbtn[data-theme="${saved}"]`);
  if (btn) btn.classList.add('active');
}

// --- Sticky header shadow ---
window.addEventListener('scroll', () => {
  document.getElementById('themeBar').classList.toggle('scrolled', window.scrollY > 8);
}, { passive: true });

// --- Init ---
initTheme();
loadSlots();

// --- Load slots ---
async function loadSlots() {
  try {
    const data = await api({ action: 'getSlots' });
    slots = (data.slots || []).sort((a, b) => {
      const da = parseDate(a.date), db = parseDate(b.date);
      if (!da) return 1; if (!db) return -1;
      if (da - db !== 0) return da - db;
      return (a.time || '').localeCompare(b.time || '');
    });
    renderCalendar();
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
          <div class="day-name">${dayLabel}</div>
          <div class="day-date-num">${dateNum}</div>
          <div class="day-month">${monthStr}</div>`;

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
          <div class="day-name">${dayLabel}</div>
          <div class="day-date-num">${dateNum}</div>
          <div class="day-month">${monthStr}</div>
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
      name, whatsapp, email
    });

    if (data.success) {
      // --- Send WhatsApp notification to Janaína ---
      const d   = parseDate(selectedSlot.date);
      const lbl = d
        ? `${DAYS_FULL[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()} às ${selectedSlot.time}`
        : `${selectedSlot.day} às ${selectedSlot.time}`;

      const msg = encodeURIComponent(
        `🗓 Nova reserva!\n\n` +
        `👤 Nome: ${name}\n` +
        `📱 WhatsApp: ${whatsapp}\n` +
        `✉️ Email: ${email}\n` +
        `📅 Horário: ${lbl}`
      );

      // --- Fire and forget — don't block the UI ---
      if (CALLMEBOT_KEY !== 'YOUR_CALLMEBOT_KEY') {
        fetch(`https://api.callmebot.com/whatsapp.php?phone=${CALLMEBOT_PHONE}&text=${msg}&apikey=${CALLMEBOT_KEY}`)
          .catch(() => {}); // silent fail — booking already saved
      }

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
  document.getElementById('adminPanel').classList.toggle('open');
}

async function adminAuth() {
  const pw    = document.getElementById('adminPassword').value;
  const msgEl = document.getElementById('adminLoginMsg');
  try {
    const data = await api({ action: 'adminGetBookings', password: pw });
    if (data.success) {
      adminPass = pw;
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
    return `<div class="admin-slot-row">
      <span><strong>${slot.day}</strong> — ${lbl}</span>
      <span class="slot-status-pill ${slot.status}">${slot.status === 'available' ? 'Livre' : 'Reservado'}</span>
      <button class="btn-small ${slot.status === 'available' ? 'danger' : 'success-btn'}"
              onclick="toggleSlotStatus('${slot.id}','${slot.status}')">
        ${slot.status === 'available' ? 'Bloquear' : 'Liberar'}
      </button>
    </div>`;
  }).join('');
}

function renderAdminBookings(bookings) {
  const el = document.getElementById('adminBookingsList');
  if (!bookings.length) { el.innerHTML = '<p style="font-size:13px;color:var(--muted);font-weight:300;">Nenhum agendamento ainda.</p>'; return; }
  el.innerHTML = bookings.map(b => `
    <div class="booking-row">
      <div class="booking-slot-id">${b.slotId}</div>
      <div class="booking-details">
        <strong>${b.name}</strong><br/>
        📱 ${b.whatsapp}<br/>
        ✉️ ${b.email}<br/>
        <span style="font-size:11px;color:var(--muted);">${b.timestamp}</span>
      </div>
    </div>`).join('');
}

async function toggleSlotStatus(id, currentStatus) {
  const newStatus = currentStatus === 'available' ? 'booked' : 'available';
  try {
    const data = await api({ action: 'adminUpdateSlot', password: adminPass, slotId: id, status: newStatus });
    if (data.success) {
      const s = slots.find(s => s.id === id);
      if (s) s.status = newStatus;
      renderCalendar();
      renderAdminSlots();
    }
  } catch(e) { alert('Erro ao atualizar horário.'); }
}

async function addSlot() {
  const id    = document.getElementById('newSlotId').value.trim();
  const day   = document.getElementById('newSlotDay').value.trim();
  const date  = document.getElementById('newSlotDate').value.trim();
  const time  = document.getElementById('newSlotTime').value.trim();
  const msgEl = document.getElementById('addSlotMsg');

  if (!id || !day || !date || !time) { showMsg(msgEl, 'error', 'Preencha todos os campos.'); return; }

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
      document.getElementById('newSlotId').value   = '';
      document.getElementById('newSlotDay').value  = '';
      document.getElementById('newSlotDate').value = '';
      document.getElementById('newSlotTime').value = '';
      showMsg(msgEl, 'success', 'Horário adicionado!');
    } else { showMsg(msgEl, 'error', data.error || 'Erro ao adicionar.'); }
  } catch(e) { showMsg(msgEl, 'error', 'Erro de conexão.'); }
}

// --- Helper ---
function showMsg(el, type, text) {
  el.className     = `message ${type}`;
  el.textContent   = text;
  el.style.display = 'block';
}