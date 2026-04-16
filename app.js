// --- Config ---
const API_URL = 'https://script.google.com/macros/s/AKfycbwpUudEWOYUi3ujZXSaHNwfN9Cph7A_iv3FEkIC1d9RT7hrjTzZiDZgiI_9Y3y1RaxRQw/exec';

// --- State ---
let slots        = [];
let bookings     = [];
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
 
// --- Fix 2: Restore admin session on page load ---
function restoreAdminSession() {
  const skeletonEl = document.getElementById('adminSkeleton');
  const loginEl    = document.getElementById('adminLogin');
  const contentEl  = document.getElementById('adminContent');
 
  if (!adminPass) {
    // Not logged in — hide skeleton, show login
    if (skeletonEl) skeletonEl.style.display = 'none';
    if (loginEl)    loginEl.style.display    = 'block';
    return;
  }
 
  // Has saved session — keep skeleton, hide login while we verify
  if (loginEl)    loginEl.style.display    = 'none';
 
  api({ action: 'adminGetBookings', password: adminPass }).then(data => {
    if (skeletonEl) skeletonEl.style.display = 'none';
    if (data.success) {
      if (contentEl) contentEl.style.display = 'block';
      const panel = document.getElementById('adminPanel');
      if (panel) {
        const wasOpen = sessionStorage.getItem('jana-admin-open') === 'true';
        if (wasOpen) panel.classList.add('open');
      }
      renderAdminBookings(data.bookings);
    } else {
      sessionStorage.removeItem('jana-admin-pass');
      sessionStorage.removeItem('jana-admin-open');
      adminPass = '';
      if (loginEl) loginEl.style.display = 'block';
    }
  }).catch(() => {
    if (skeletonEl) skeletonEl.style.display = 'none';
    if (loginEl)    loginEl.style.display    = 'block';
  });
}
 
// --- Populate time dropdown with 15min intervals ---
function populateTimeDropdown() {
  const select = document.getElementById('newSlotTime');
  const bulkSelect = document.getElementById('bulkSlotTime');
  const opts = '<option value="">Selecione...</option>' + (() => {
    let html = '';
    for (let h = 6; h < 23; h++) {
      for (let m = 0; m < 60; m += 15) {
        const hh  = String(h).padStart(2, '0');
        const mm  = String(m).padStart(2, '0');
        const val = `${hh}:${mm}`;
        const lbl = `${hh}h${mm === '00' ? '' : mm}`;
        html += `<option value="${val}">${lbl}</option>`;
      }
    }
    return html;
  })();
  if (select) select.innerHTML = opts;
  if (bulkSelect) bulkSelect.innerHTML = opts;
}
 
async function atualizarSlots() {
  const icon = document.getElementById('atualizarIcon');
  const btn  = document.getElementById('atualizarBtn');
  if (icon) icon.classList.add('spinning');
  if (btn)  btn.disabled = true;
  await loadSlots();
  renderAdminSlots();
  if (icon) icon.classList.remove('spinning');
  if (btn)  btn.disabled = false;
}
 
 
let bulkWeekStart = null;
const DAY_ABBR = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
 
function getMonday(d) {
  const date = new Date(d);
  const dow  = date.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + diff);
  date.setHours(0,0,0,0);
  return date;
}
 
function initBulkWeek() {
  bulkWeekStart = getMonday(new Date());
  renderBulkGrid();
}
 
function bulkPrevWeek() { bulkWeekStart.setDate(bulkWeekStart.getDate() - 7); renderBulkGrid(); }
function bulkNextWeek() { bulkWeekStart.setDate(bulkWeekStart.getDate() + 7); renderBulkGrid(); }
 
function renderBulkGrid() {
  const grid  = document.getElementById('bulkDaysGrid');
  const label = document.getElementById('bulkWeekLabel');
  if (!grid) return;
 
  const endDate = new Date(bulkWeekStart);
  endDate.setDate(endDate.getDate() + 5);
  const fmt = d => `${d.getDate()} ${MONTHS[d.getMonth()].substring(0,3)}`;
  label.textContent = `${fmt(bulkWeekStart)} – ${fmt(endDate)} de ${bulkWeekStart.getFullYear()}`;
 
  grid.innerHTML = '';
  const today = new Date(); today.setHours(0,0,0,0);
 
  for (let i = 0; i < 6; i++) {
    const day  = new Date(bulkWeekStart);
    day.setDate(day.getDate() + i);
    const isPast = day < today;
    const yyyy = day.getFullYear();
    const mm   = String(day.getMonth()+1).padStart(2,'0');
    const dd   = String(day.getDate()).padStart(2,'0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const dayName = DAY_ABBR[day.getDay()];
 
    const btn = document.createElement('div');
    btn.className = 'bulk-day-btn' + (isPast ? ' bulk-past' : '');
    btn.dataset.date = dateStr;
    btn.dataset.day  = DAYS_FULL[day.getDay()].split('-')[0];
    btn.innerHTML    = `<span class="bulk-abbr">${dayName}</span><span class="bulk-num">${day.getDate()}</span>`;
    if (!isPast) btn.onclick = () => { btn.classList.toggle('bulk-selected'); updateBulkPreview(); };
    grid.appendChild(btn);
  }
  updateBulkPreview();
}
 
function updateBulkPreview() {
  const preview = document.getElementById('bulkPreview');
  const btn     = document.getElementById('bulkAddBtn');
  const timeVal = document.getElementById('bulkSlotTime').value;
  const timeLbl = formatTimeDisplay(timeVal);
  const selected = document.querySelectorAll('.bulk-day-btn.bulk-selected');
 
  if (!selected.length || !timeVal) {
    preview.innerHTML = '<span style="font-size:11px;">Selecione os dias e o horário</span>';
    btn.disabled = true; btn.style.opacity = '0.5';
    return;
  }
 
  const tags = Array.from(selected).map(el => {
    const d = parseDate(el.dataset.date);
    return `<span style="background:#f7efed;border:0.5px solid #e4d0ca;border-radius:4px;padding:3px 8px;font-size:11px;color:#855447;">${el.dataset.day} ${d.getDate()}/${String(d.getMonth()+1).padStart(2,'0')} · ${timeLbl}</span>`;
  }).join('');
 
  preview.innerHTML = tags;
  btn.disabled = false; btn.style.opacity = '1';
  btn.innerHTML = `+ Adicionar ${selected.length} horário${selected.length > 1 ? 's' : ''}`;
}
 
async function addBulkSlots() {
  const timeVal  = document.getElementById('bulkSlotTime').value;
  const timeLbl  = formatTimeDisplay(timeVal);
  const selected = Array.from(document.querySelectorAll('.bulk-day-btn.bulk-selected'));
  const msgEl    = document.getElementById('addSlotMsg');
  const btn      = document.getElementById('bulkAddBtn');
 
  if (!selected.length || !timeVal) return;
 
  btn.disabled = true; btn.innerHTML = 'Adicionando...';
 
  // Check duplicates first
  const duplicates = selected.filter(el => {
    const d = parseDate(el.dataset.date);
    return slots.find(s => {
      const sd = parseDate(s.date);
      return sd && d &&
        sd.getFullYear() === d.getFullYear() &&
        sd.getMonth()    === d.getMonth() &&
        sd.getDate()     === d.getDate() &&
        s.time.trim()    === timeLbl.trim();
    });
  });
 
  if (duplicates.length) {
    const lbls = duplicates.map(el => el.dataset.day).join(', ');
    showMsg(msgEl, 'error', `Horário ${timeLbl} já existe para: ${lbls}`);
    btn.disabled = false; btn.innerHTML = `+ Adicionar ${selected.length} horários`;
    return;
  }
 
  let added = 0;
  for (const el of selected) {
    const dateVal  = el.dataset.date;
    const dayName  = el.dataset.day;
    const timeClean = timeVal.replace(':', 'h').replace('h00', 'h');
    const id       = `${dateVal}-${timeClean}`;
 
    try {
      const data = await api({ action: 'adminAddSlot', password: adminPass, id, day: dayName, time: timeLbl, date: dateVal });
      if (data.success) {
        slots.push({ id, day: dayName, time: timeLbl, date: dateVal, status: 'available' });
        added++;
      }
    } catch(e) {}
  }
 
  if (added > 0) {
    slots.sort((a,b) => { const da = parseDate(a.date), db = parseDate(b.date); if (!da) return 1; if (!db) return -1; if (da-db !== 0) return da-db; return (a.time||'').localeCompare(b.time||''); });
    renderCalendar();
    renderAdminSlots();
    // Deselect all
    document.querySelectorAll('.bulk-day-btn.bulk-selected').forEach(b => b.classList.remove('bulk-selected'));
    document.getElementById('bulkSlotTime').value = '';
    updateBulkPreview();
    showMsg(msgEl, 'success', `${added} horário${added > 1 ? 's adicionados' : ' adicionado'} com sucesso!`);
  } else {
    showMsg(msgEl, 'error', 'Erro ao adicionar. Tente novamente.');
  }
 
  btn.disabled = false; btn.innerHTML = '+ Adicionar horários';
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
// --- Init ---
checkCancelToken();
loadSlots();
restoreAdminSession();
populateTimeDropdown();
initBulkWeek();
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
        // --- If today, check if time has passed (local time) ---
        if (d.getTime() === today.getTime()) {
          const timeParts = s.time.match(/^(\d{1,2})h(\d{0,2})/);
          if (timeParts) {
            const slotMins = parseInt(timeParts[1]) * 60 + parseInt(timeParts[2] || 0);
            const nowMins  = now.getHours() * 60 + now.getMinutes();
            if (slotMins <= nowMins) return false;
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
    const skeleton = document.getElementById('skeletonLoader');
    if (skeleton) skeleton.style.display = 'none';
    renderCalendar();
    // --- Re-render admin slots if already logged in ---
    const adminContentEl = document.getElementById('adminContent');
    if (adminPass && adminContentEl && adminContentEl.style.display === 'block') {
      renderAdminSlots();
    }
  } catch(e) {
    const skeleton = document.getElementById('skeletonLoader');
    if (skeleton) skeleton.style.display = 'none';
    const cc = document.getElementById('calendarContainer');
    if (cc) cc.innerHTML = `<div class="empty-state">Não foi possível carregar os horários. <button onclick="loadSlots()" style="background:none;border:none;color:var(--brand);cursor:pointer;font-size:13px;text-decoration:underline;">Tentar novamente</button></div>`;
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
          const ariaLabel = isBooked
            ? `Horário ${slot.time} — Reservado`
            : isSelected
              ? `Horário ${slot.time} — Selecionado`
              : `Selecionar horário ${slot.time}`;
          html += `<button class="slot-btn ${cls}" ${click} aria-label="${ariaLabel}" ${isBooked ? 'aria-disabled="true"' : ''}>
            <span class="slot-time-label" aria-hidden="true">${slot.time}</span>
            <span class="slot-status-label" aria-hidden="true">${statusTxt}</span>
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
    // --- Track slot selection in GA4 ---
    if (typeof gtag !== 'undefined') {
      gtag('event', 'slot_selected', { slot_id: id });
    }
  } else {
    form.style.display = 'none';
  }
}
 
// --- Check for cancel token on page load ---
function checkCancelToken() {
  const params      = new URLSearchParams(window.location.search);
  const cancelToken = params.get('cancel');
  if (!cancelToken) return;
 
  // --- Show cancel screen, hide everything else ---
  const calEl = document.getElementById('calendarContainer'); if (calEl) calEl.style.display = 'none';
  document.getElementById('cancelScreen').style.display      = 'block';
 
  // --- Store token for confirmation ---
  window._cancelToken = cancelToken;
}
 
// --- Confirm cancellation ---
async function confirmCancel() {
  const btn = document.getElementById('btnConfirmCancel');
  btn.disabled    = true;
  btn.textContent = 'Cancelando...';
 
  try {
    const data = await api({ action: 'cancelBooking', token: window._cancelToken });
    if (data.success) {
      // --- Track cancellation in GA4 ---
      if (typeof gtag !== 'undefined') {
        gtag('event', 'booking_cancelled');
      }
      document.getElementById('cancelIcon').textContent  = '✅';
      document.getElementById('cancelTitle').textContent = 'Agendamento cancelado!';
      document.getElementById('cancelMsg').textContent   =
        'Seu agendamento foi cancelado com sucesso. Você receberá um e-mail de confirmação em breve.';
      document.getElementById('cancelActions').innerHTML =
        `<a class="btn-new-booking" href="${window.location.pathname}" style="display:inline-block;margin-top:16px;text-decoration:none;">Fazer novo agendamento</a>`;
    } else if (data.error === 'already_cancelled') {
      document.getElementById('cancelIcon').textContent  = '⚠️';
      document.getElementById('cancelTitle').textContent = 'Já cancelado';
      document.getElementById('cancelMsg').textContent   =
        'Este agendamento já foi cancelado anteriormente ou o link não é mais válido.';
      document.getElementById('cancelActions').innerHTML =
        `<a class="btn-new-booking" href="${window.location.pathname}" style="display:inline-block;margin-top:16px;text-decoration:none;">Voltar à agenda</a>`;
    } else {
      document.getElementById('cancelIcon').textContent  = '⚠️';
      document.getElementById('cancelTitle').textContent = 'Link inválido';
      document.getElementById('cancelMsg').textContent   =
        'Este link de cancelamento não é válido ou já foi utilizado.';
      document.getElementById('cancelActions').innerHTML =
        `<a class="btn-new-booking" href="${window.location.pathname}" style="display:inline-block;margin-top:16px;text-decoration:none;">Voltar à agenda</a>`;
    }
  } catch(e) {
    btn.disabled    = false;
    btn.textContent = 'Sim, cancelar agendamento';
    alert('Erro de conexão. Tente novamente.');
  }
}
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
 
// --- Validate tipo de atendimento ---
function validateTipo() {
  const selected = document.querySelector('input[name="tipoAtendimento"]:checked');
  const err      = document.getElementById('errTipo');
  if (!selected) {
    err.classList.add('show');
    return false;
  }
  err.classList.remove('show');
  return true;
}
async function submitBooking() {
  const name     = document.getElementById('fieldName').value.trim();
  const whatsapp = document.getElementById('fieldWhatsapp').value.trim();
  const email    = document.getElementById('fieldEmail').value.trim();
  const message  = document.getElementById('fieldMessage').value.trim();
  const tipoEl   = document.querySelector('input[name="tipoAtendimento"]:checked');
  const tipo     = tipoEl ? tipoEl.value : '';
  const msgEl    = document.getElementById('formMessage');
  const btn      = document.getElementById('btnSubmit');
 
  msgEl.className = 'message'; msgEl.style.display = 'none';
 
  if (!selectedSlot) { showMsg(msgEl, 'error', 'Selecione um horário.'); return; }
 
  const tipoOk  = validateTipo();
  const nameOk  = validateName();
  const phoneOk = validateWhatsapp();
  const emailOk = validateEmail();
 
  if (!tipoOk)  { showMsg(msgEl, 'error', 'Selecione o tipo de atendimento.'); return; }
  if (!nameOk)  { showMsg(msgEl, 'error', 'Informe seu nome completo (nome e sobrenome).'); return; }
  if (!phoneOk) { showMsg(msgEl, 'error', 'Informe um número de WhatsApp válido.'); return; }
  if (!emailOk) { showMsg(msgEl, 'error', 'Informe um e-mail válido.'); return; }
 
  btn.disabled = true; btn.textContent = 'Confirmando...';
 
  try {
    const data = await api({
      action: 'bookSlot',
      slotId: selectedSlot.id,
      name, whatsapp, email, message, tipo
    });
 
    if (data.success) {
      // --- Reset form fields ---
      document.getElementById('fieldName').value     = '';
      document.getElementById('fieldWhatsapp').value = '';
      document.getElementById('fieldEmail').value    = '';
      document.getElementById('fieldMessage').value  = '';
      const radios = document.querySelectorAll('input[name="tipoAtendimento"]');
      radios.forEach(r => r.checked = false);
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
      // --- Track booking conversion in GA4 ---
      if (typeof gtag !== 'undefined') {
        gtag('event', 'booking_completed', {
          slot_id : selectedSlot.id,
          tipo    : tipo
        });
      }
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
 
// --- Switch admin tabs ---
function switchTab(tab) {
  const tabs = ['horarios','agendamentos','reservar'];
  tabs.forEach(t => {
    const content = document.getElementById(`tabContent${t.charAt(0).toUpperCase()+t.slice(1)}`);
    const btn     = document.getElementById(`tab${t.charAt(0).toUpperCase()+t.slice(1)}`);
    if (content) content.style.display = t === tab ? 'block' : 'none';
    if (btn) btn.classList.toggle('active', t === tab);
  });
  if (tab === 'reservar') initManualWeek();
}
 
// ----- Manual booking -----
let manualWeekStart = null;
 
function initManualWeek() {
  if (!manualWeekStart) manualWeekStart = getMonday(new Date());
  // Populate time dropdown
  const sel = document.getElementById('manualSlotTime');
  if (sel && sel.options.length <= 1) {
    for (let h = 6; h < 23; h++) {
      for (let m = 0; m < 60; m += 15) {
        const hh = String(h).padStart(2,'0'), mm = String(m).padStart(2,'0');
        sel.innerHTML += `<option value="${hh}:${mm}">${hh}h${mm==='00'?'':mm}</option>`;
      }
    }
  }
  renderManualGrid();
}
 
function manualPrevWeek() { manualWeekStart.setDate(manualWeekStart.getDate()-7); renderManualGrid(); }
function manualNextWeek() { manualWeekStart.setDate(manualWeekStart.getDate()+7); renderManualGrid(); }
 
function renderManualGrid() {
  const grid  = document.getElementById('manualDaysGrid');
  const label = document.getElementById('manualWeekLabel');
  if (!grid) return;
  const endDate = new Date(manualWeekStart); endDate.setDate(endDate.getDate()+5);
  const fmt = d => `${d.getDate()} ${MONTHS[d.getMonth()].substring(0,3)}`;
  label.textContent = `${fmt(manualWeekStart)} – ${fmt(endDate)} de ${manualWeekStart.getFullYear()}`;
  grid.innerHTML = '';
  const today = new Date(); today.setHours(0,0,0,0);
  for (let i = 0; i < 6; i++) {
    const day = new Date(manualWeekStart); day.setDate(day.getDate()+i);
    const isPast = day < today;
    const yyyy = day.getFullYear(), mm = String(day.getMonth()+1).padStart(2,'0'), dd = String(day.getDate()).padStart(2,'0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const btn = document.createElement('div');
    btn.className = 'bulk-day-btn' + (isPast ? ' bulk-past' : '');
    btn.dataset.date = dateStr;
    btn.dataset.day  = DAYS_FULL[day.getDay()].split('-')[0];
    btn.innerHTML = `<span class="bulk-abbr">${DAY_ABBR[day.getDay()]}</span><span class="bulk-num">${day.getDate()}</span>`;
    if (!isPast) btn.onclick = () => { btn.classList.toggle('bulk-selected'); updateManualPreview(); };
    grid.appendChild(btn);
  }
  updateManualPreview();
}
 
function updateManualPreview() {
  const preview  = document.getElementById('manualPreview');
  const btn      = document.getElementById('manualBookBtn');
  const timeVal  = document.getElementById('manualSlotTime').value;
  const timeLbl  = formatTimeDisplay(timeVal);
  const selected = document.querySelectorAll('#manualDaysGrid .bulk-day-btn.bulk-selected');
  const name     = document.getElementById('manualName').value.trim();
  if (!selected.length || !timeVal) {
    preview.innerHTML = '<span style="font-size:11px;">Selecione os dias e o horário</span>';
    btn.disabled = true; btn.style.opacity = '0.5'; return;
  }
  // --- Fix 3: removable tags with × ---
  const tags = Array.from(selected).map(el => {
    const d = parseDate(el.dataset.date);
    const dateStr = el.dataset.date;
    return `<span style="display:inline-flex;align-items:center;gap:4px;background:#f7efed;border:0.5px solid #e4d0ca;border-radius:4px;padding:3px 6px 3px 8px;font-size:11px;color:#855447;">
      ${el.dataset.day} ${d.getDate()}/${String(d.getMonth()+1).padStart(2,'0')} · ${timeLbl}
      <span onclick="removeManualDay('${dateStr}')" style="cursor:pointer;font-size:13px;line-height:1;color:#a06a5a;margin-left:2px;">×</span>
    </span>`;
  }).join('');
  preview.innerHTML = tags;
  btn.disabled = false; btn.style.opacity = '1';
  btn.textContent = `+ Reservar ${selected.length} horário${selected.length>1?'s':''} ${name ? 'para '+name.split(' ')[0] : ''}`;
}
 
function removeManualDay(dateStr) {
  const btn = document.querySelector(`#manualDaysGrid .bulk-day-btn[data-date="${dateStr}"]`);
  if (btn) { btn.classList.remove('bulk-selected'); updateManualPreview(); }
}
 
async function addManualBooking() {
  const name      = document.getElementById('manualName').value.trim();
  const whatsapp  = document.getElementById('manualWhatsapp').value.trim();
  const email     = document.getElementById('manualEmail').value.trim();
  const tipo      = document.getElementById('manualTipo').value;
  const msg       = document.getElementById('manualMsg').value.trim();
  const timeVal   = document.getElementById('manualSlotTime').value;
  const timeLbl   = formatTimeDisplay(timeVal);
  const sendEmail = document.getElementById('manualSendEmail').checked;
  const selected  = Array.from(document.querySelectorAll('#manualDaysGrid .bulk-day-btn.bulk-selected'));
  const msgEl     = document.getElementById('manualBookMsg');
  const btn       = document.getElementById('manualBookBtn');
 
  if (!name || !whatsapp || !tipo || !timeVal || !selected.length) {
    showMsg(msgEl, 'error', 'Preencha nome, WhatsApp, tipo e selecione pelo menos um horário.');
    return;
  }
 
  // --- Fix 2: grey out button while processing, clear previous message ---
  btn.disabled = true; btn.style.opacity = '0.6'; btn.textContent = 'Reservando...';
  msgEl.style.display = 'none';
 
  let added = 0;
  for (const el of selected) {
    const dateVal   = el.dataset.date;
    const dayName   = el.dataset.day;
    const timeClean = timeVal.replace(':','h').replace('h00','h');
    const slotId    = `${dateVal}-${timeClean}`;
    try {
      // --- Fix 1: if slot doesn't exist yet, create it first ---
      const existingSlot = slots.find(s => s.id === slotId);
      if (!existingSlot) {
        const addData = await api({ action: 'adminAddSlot', password: adminPass, id: slotId, day: dayName, time: timeLbl, date: dateVal });
        if (addData.success) {
          slots.push({ id: slotId, day: dayName, time: timeLbl, date: dateVal, status: 'available' });
        }
      } else if (existingSlot.status === 'booked') {
        continue;
      }
      const data = await api({ action: 'bookSlot', slotId, name, whatsapp, email, tipo, message: msg, sendEmail });
      // --- Treat success OR already booked in sheet as success since slot+entry both created ---
      if (data.success || data.error === 'Slot not available.') {
        const slot = slots.find(s => s.id === slotId);
        if (slot) slot.status = 'booked';
        bookings.push({ slotId, name, whatsapp, email, tipo, message: msg, timestamp: new Date().toLocaleString('pt-BR') });
        added++;
      }
    } catch(e) {}
  }
 
  if (added > 0) {
    renderCalendar();
    renderAdminSlots();
    renderAdminBookings(bookings);
    ['manualName','manualWhatsapp','manualEmail','manualMsg'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
    document.getElementById('manualTipo').value = '';
    document.getElementById('manualSlotTime').value = '';
    document.querySelectorAll('#manualDaysGrid .bulk-day-btn.bulk-selected').forEach(b => b.classList.remove('bulk-selected'));
    updateManualPreview();
    showMsg(msgEl, 'success', `${added} horário${added>1?'s reservados':' reservado'} com sucesso!`);
  } else {
    showMsg(msgEl, 'error', 'Erro ao reservar. Verifique os horários e tente novamente.');
  }
  btn.disabled = false; btn.style.opacity = '1';
}
 
 
 
// --- Admin ---
function toggleAdmin() {
  const panel  = document.getElementById('adminPanel');
  const btn    = document.querySelector('.btn-admin');
  panel.classList.toggle('open');
  const isOpen = panel.classList.contains('open');
 
  // --- Update aria-expanded ---
  if (btn) btn.setAttribute('aria-expanded', isOpen);
 
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
    } else { showMsg(msgEl, 'error', 'Senha incorreta.'); }
  } catch(e) { showMsg(msgEl, 'error', 'Erro de conexão.'); }
}
 
function renderAdminSlots() {
  const el = document.getElementById('adminSlotsList');
  if (!slots.length) { el.innerHTML = '<p style="font-size:13px;color:var(--muted);">Nenhum horário cadastrado.</p>'; return; }
 
  // --- Group slots by Month-Year ---
  const groups = {};
  slots.forEach(slot => {
    const d = parseDate(slot.date);
    const key = d ? `${MONTHS[d.getMonth()]} — ${d.getFullYear()}` : 'Outros';
    if (!groups[key]) groups[key] = [];
    groups[key].push(slot);
  });
 
  function slotRow(slot) {
    const d   = parseDate(slot.date);
    const lbl = d
      ? `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()} · ${slot.time}`
      : `${slot.day} · ${slot.time}`;
    // --- Look up first name from bookings if slot is booked ---
    const patientName = slot.status === 'booked'
      ? (() => { const b = bookings.find(b => b.slotId === slot.id); return b ? b.name : 'bloqueado'; })()
      : '';
    return `
      <div class="admin-slot-row" id="row-${slot.id}">
        <span class="admin-slot-label"><strong>${slot.day}</strong> — ${lbl}${patientName === 'bloqueado' 
          ? '<span class="slot-patient-name" style="color:var(--muted);">Bloqueado por Janaína</span>' 
          : patientName ? `<span class="slot-patient-name">${patientName}</span>` : ''}</span>
        <span class="slot-status-pill ${slot.status}">${slot.status === 'available' ? 'Livre' : 'Reservado'}</span>
        <div class="admin-slot-actions">
          <button class="btn-small ${slot.status === 'available' ? 'danger' : 'success-btn'}"
                  onclick="startToggleSlotStatus('${slot.id}','${slot.status}')">
            ${slot.status === 'available' ? 'Bloquear' : 'Liberar'}
          </button>
          <button class="btn-icon btn-edit" title="Editar" onclick="startEditSlot('${slot.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>
          ${slot.status === 'booked'
            ? '<button class="btn-icon" disabled style="opacity:0.2;cursor:not-allowed;" title="Não pode deletar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>'
            : `<button class="btn-icon btn-delete" title="Deletar" onclick="startDeleteSlot('${slot.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>`}
        </div>
      </div>`;
  }
 
  el.innerHTML = Object.entries(groups).map(([monthYear, monthSlots]) => `
    <div class="admin-month-group">
      <p class="admin-month-label">${monthYear}</p>
      ${monthSlots.map(slotRow).join('')}
    </div>
  `).join('');
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
  // --- Close any other open edit form first ---
  renderAdminSlots();
 
  // --- Ensure date is clean YYYY-MM-DD format ---
  const d       = parseDate(slot.date);
  const dateVal = d
    ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    : '';
 
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
      <input type="date" id="edit-date-${id}" value="${dateVal}" onchange="onEditDateChange('${id}')"/>
      <select id="edit-time-${id}" onchange="onEditDateChange('${id}')">${getTimeOptions(timeVal)}</select>
      <input type="text" id="edit-day-${id}"  value="${slot.day}" disabled/>
      <input type="text" id="edit-id-${id}"   value="${id}" disabled style="font-size:10px;"/>
      <div class="edit-btn-group">
        <button class="btn-small success-btn" onclick="saveEditSlot('${id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13" style="flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>Salvar</button>
        <button class="btn-small" style="background:var(--muted)" onclick="renderAdminSlots()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13" style="flex-shrink:0"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancelar</button>
      </div>
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
    const slotMins = hh * 60 + mm;
    const nowMins  = now.getHours() * 60 + now.getMinutes();
    if (slotMins <= nowMins) {
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
    } else { alert(data.error || 'Erro ao editar.'); btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13" style="flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>Salvar'; }
  } catch(e) { alert('Erro de conexão.'); btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13" style="flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>Salvar'; }
}
 
// --- Start inline block/unblock confirmation ---
function startToggleSlotStatus(id, currentStatus) {
  const slot = slots.find(s => s.id === id);
  if (!slot) return;
  const d      = parseDate(slot.date);
  const lbl    = d ? `${d.getDate()} de ${MONTHS[d.getMonth()]} · ${slot.time}` : slot.time;
  const action = currentStatus === 'available' ? 'Bloquear' : 'Liberar';
  const cls    = currentStatus === 'available' ? 'danger' : 'success-btn';
  const row    = document.getElementById(`row-${id}`);
  row.innerHTML = `
    <span style="font-size:13px;color:var(--text-2);">${action} <strong>${slot.day} — ${lbl}</strong>?</span>
    <div class="admin-slot-actions">
      <button class="btn-small ${cls}" onclick="toggleSlotStatus('${id}','${currentStatus}')">Sim, ${action.toLowerCase()}</button>
      <button class="btn-small" style="background:var(--muted)" onclick="renderAdminSlots()">Cancelar</button>
    </div>`;
}
function startDeleteSlot(id) {
  const slot = slots.find(s => s.id === id);
  if (!slot) return;
  if (slot.status === 'booked') {
    alert('Este horário tem um cliente agendado e não pode ser deletado. Cancele o agendamento primeiro.');
    return;
  }
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
    if (data.success || data.error === 'Slot not found.') {
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
 
function renderAdminBookings(data) {
  bookings = data || [];
  if (document.getElementById('adminSlotsList')) renderAdminSlots();
  const el = document.getElementById('adminBookingsList');
  // --- Update tab badge count ---
  const tab = document.getElementById('tabAgendamentos');
  if (tab) {
    const count = bookings.length > 0 ? ` (${bookings.length})` : '';
    tab.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> Agendamentos${count}`;
  }
  if (!bookings.length) {
    el.innerHTML = '<p style="font-size:13px;color:var(--muted);font-weight:300;">Nenhum agendamento ainda.</p>';
    return;
  }
  // --- Split into upcoming and past ---
  const today = new Date(); today.setHours(0,0,0,0);
  const upcoming = bookings.filter(b => { const d = parseDate(b.slotId); return d && d >= today; });
  const past     = bookings.filter(b => { const d = parseDate(b.slotId); return !d || d < today; });
 
  // --- Upcoming: soonest first. Past: newest first ---
  upcoming.sort((a,b) => parseDate(a.slotId) - parseDate(b.slotId));
  past.sort((a,b) => parseDate(b.slotId) - parseDate(a.slotId));
 
  function renderRow(b, isPast) {
    const tipoIcon = b.tipo
      ? (b.tipo.includes('Online') ? '<svg class="detail-icon" viewBox="0 0 24 24" fill="none" width="13" height="13" stroke="#A06A5A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>' : '<svg class="detail-icon" viewBox="0 0 24 24" fill="none" width="13" height="13" stroke="#A06A5A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>')
      : '';
    const rowStyle = isPast ? 'opacity:0.5;' : '';
    const pastBadge = isPast ? '<span style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);display:block;margin-top:2px;">passado</span>' : '';
    // --- Format slotId: "2026-04-16-20h" → date "16/04/2026" + time "20h" ---
    const slotParts = (b.slotId || '').match(/^(\d{4})-(\d{2})-(\d{2})-(.+)$/);
    const slotDate  = slotParts ? `${slotParts[3]}/${slotParts[2]}/${slotParts[1]}` : (b.slotId || '—');
    const slotTime  = slotParts ? slotParts[4] : '';
    return `
    <div class="booking-row" style="${rowStyle}">
      <div class="booking-slot-id">
        <span style="display:block;font-weight:500;">${slotDate}</span>
        ${slotTime ? `<span style="display:block;font-size:11px;color:var(--muted);margin-top:1px;">${slotTime}</span>` : ''}
        ${pastBadge}
      </div>
      <div class="booking-details">
        <strong>${b.name || '—'}</strong>
        <span class="detail-line"><svg class="detail-icon" viewBox="0 0 24 24" fill="none" width="13" height="13" stroke="#a07d73" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.58 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>${b.whatsapp || '—'}</span>
        <span class="detail-line"><svg class="detail-icon" viewBox="0 0 24 24" fill="none" width="13" height="13" stroke="#a07d73" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>${b.email || '—'}</span>
        ${b.tipo    ? `<span class="detail-line">${tipoIcon} ${b.tipo}</span>` : ''}
        ${b.message ? `<span class="detail-line"><svg class="detail-icon" viewBox="0 0 24 24" fill="none" width="13" height="13" stroke="#a07d73" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>${b.message}</span>` : ''}
        <span style="font-size:11px;color:var(--muted);">${formatTimestamp(b.timestamp || '')}</span>
      </div>
    </div>`;
  }
 
  const upcomingHTML = upcoming.length
    ? `<p style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:var(--brand);margin-bottom:8px;">Próximos (${upcoming.length})</p>` + upcoming.map(b => renderRow(b, false)).join('')
    : '';
 
  const pastHTML = past.length
    ? `<p style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted);margin-top:16px;margin-bottom:8px;">Anteriores (${past.length})</p>` + past.map(b => renderRow(b, true)).join('')
    : '';
 
  el.innerHTML = upcomingHTML + pastHTML;
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
  // --- If today, check time hasn't passed (using local time) ---
  if (selectedDate.getTime() === today.getTime()) {
    const [hh, mm]   = timeVal.split(':').map(Number);
    const nowHour    = now.getHours();
    const nowMin     = now.getMinutes();
    const slotMins   = hh * 60 + mm;
    const nowMins    = nowHour * 60 + nowMin;
    if (slotMins <= nowMins) {
      showMsg(msgEl, 'error', 'Este horário já passou hoje. Escolha um horário futuro.');
      return;
    }
  }
 
  // --- Check for duplicate slot (same date + time) ---
  const time = formatTimeDisplay(timeVal);
  const selectedDateObj = parseDate(date);
  const duplicate = slots.find(s => {
    const slotDateObj = parseDate(s.date);
    const sameDate = selectedDateObj && slotDateObj &&
      selectedDateObj.getFullYear() === slotDateObj.getFullYear() &&
      selectedDateObj.getMonth()    === slotDateObj.getMonth() &&
      selectedDateObj.getDate()     === slotDateObj.getDate();
    const sameTime = s.time.trim().toLowerCase() === time.trim().toLowerCase();
    return sameDate && sameTime;
  });
  if (duplicate) {
    showMsg(msgEl, 'error', 'Já existe um horário cadastrado para esta data e hora.');
    return;
  }
 
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
