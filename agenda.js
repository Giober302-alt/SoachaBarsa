/**
 * @file agenda.js
 * @description Agenda / horarios de eventos — Barsa Soacha Academy.
 */
import { requireAuth } from './auth.js';
import {
  initShell, toast, showConfirm, hideLoader, showLoader,
  createDocument, updateDocument, deleteDocument, subscribeCollection
} from './app.js';
import { COLLECTIONS } from './firebase-config.js';
import { Timestamp, collection, query, orderBy } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { db } from './firebase-config.js';
import { notify } from './notifications.js';

let events = [];

const init = async () => {
  showLoader('Cargando agenda…');
  const profile = await requireAuth('coordinator');
  if (!profile) return;
  initShell();

  document.getElementById('btnNewEvent')?.addEventListener('click', () => openForm());

  subscribeCollection(COLLECTIONS.SCHEDULES, (list) => {
    events = list.sort((a, b) => toDate(a.startTime) - toDate(b.startTime));
    render(events);
    hideLoader();
  });
};

const toDate = (ts) => ts?.toDate ? ts.toDate() : new Date(ts || 0);

const UNIFORM_LABEL = { training: 'Entrenamiento', presentation: 'Presentación', goalkeeper: 'Arquero', tournament: 'Torneo', other: 'Otro' };
const UNIFORM_COLOR = { training: '#0dcaf0', presentation: 'var(--color-gold)', goalkeeper: '#9c27b0', tournament: '#8B0000', other: 'var(--text-muted)' };

const typeBadge = (t) => {
  const map = { Entrenamiento: 'badge-arrived', Partido: 'badge-pending', Reunión: 'badge-excused' };
  return map[t] || 'badge-arrived';
};

const render = (list) => {
  const el = document.getElementById('eventsContainer');
  if (!el) return;
  if (list.length === 0) {
    el.innerHTML = `<div class="empty-widget"><i class="fas fa-calendar-alt"></i><p>Sin eventos todavía. Crea el primero con "Nuevo evento".</p></div>`;
    return;
  }
  el.innerHTML = list.map(ev => {
    const d = toDate(ev.startTime);
    return `<div class="card-bara" style="padding:16px 20px;display:flex;align-items:center;gap:16px">
      <div style="min-width:56px;text-align:center">
        <div style="font-family:var(--font-display);font-size:22px;line-height:1;color:var(--text-primary)">${d.getDate()}</div>
        <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">${d.toLocaleDateString('es-CO',{month:'short'})}</div>
      </div>
      <div style="flex:1;min-width:0">
        <p style="font-weight:600;font-size:14px">${ev.cancelled ? '<span style="text-decoration:line-through;color:var(--text-muted)">' + escapeHtml(ev.title || '—') + '</span>' : escapeHtml(ev.title || '—')}</p>
        <p style="font-size:12px;color:var(--text-muted)"><i class="fas fa-clock"></i> ${d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})} · ${escapeHtml(ev.venue || '')}${ev.court ? ' · Cancha ' + escapeHtml(ev.court) : ''}</p>
        ${ev.uniform ? `<span class="badge-status" style="background:${UNIFORM_COLOR[ev.uniform]}22;color:${UNIFORM_COLOR[ev.uniform]};margin-top:6px;display:inline-block"><i class="fas fa-tshirt"></i> ${UNIFORM_LABEL[ev.uniform] || ev.uniform}</span>` : ''}
        ${ev.notes ? `<p style="font-size:12px;color:var(--text-secondary);margin-top:6px"><i class="fas fa-circle-info"></i> ${escapeHtml(ev.notes)}</p>` : ''}
      </div>
      ${ev.cancelled ? `<span class="badge-status badge-overdue">Cancelado</span>` : `<span class="badge-status ${typeBadge(ev.type)}">${escapeHtml(ev.type || 'Entrenamiento')}</span>`}
      <button class="btn-outline-bara" style="padding:6px 10px" data-edit="${ev.id}"><i class="fas fa-pen"></i></button>
      <button class="btn-outline-bara" style="padding:6px 10px;color:#dc3545;border-color:#dc3545" data-delete="${ev.id}"><i class="fas fa-trash"></i></button>
    </div>`;
  }).join('');

  el.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
    openForm(events.find(e => e.id === btn.dataset.edit));
  }));
  el.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', async () => {
    const ok = await showConfirm('¿Eliminar evento?', 'Esta acción no se puede deshacer.', 'Eliminar');
    if (ok) { await deleteDocument(COLLECTIONS.SCHEDULES, btn.dataset.delete); toast('Evento eliminado', 'success'); }
  }));
};

const openForm = (existing = null) => {
  const d = existing ? toDate(existing.startTime) : new Date();
  const dateStr = existing ? d.toISOString().slice(0, 10) : '';
  const timeStr = existing ? d.toTimeString().slice(0, 5) : '';

  Swal.fire({
    title: existing ? 'Editar evento' : 'Nuevo evento',
    html: `
      <div style="text-align:left">
        <label class="form-label-bara">Título</label>
        <input id="swalTitle" class="form-control-bara swal2-input" style="margin:0 0 12px" value="${existing ? escapeHtml(existing.title || '') : ''}">
        <label class="form-label-bara">Tipo</label>
        <select id="swalType" class="form-control-bara swal2-input" style="margin:0 0 12px">
          ${['Entrenamiento','Partido','Reunión'].map(t => `<option value="${t}" ${existing?.type === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <div style="display:flex;gap:10px">
          <div style="flex:1"><label class="form-label-bara">Sede</label>
          <input id="swalVenue" class="form-control-bara swal2-input" style="margin:0" value="${existing ? escapeHtml(existing.venue || existing.location || '') : ''}"></div>
          <div style="flex:1"><label class="form-label-bara">Cancha</label>
          <input id="swalCourt" class="form-control-bara swal2-input" style="margin:0" value="${existing ? escapeHtml(existing.court || '') : ''}"></div>
        </div>
        <div style="display:flex;gap:10px">
          <div style="flex:1"><label class="form-label-bara">Fecha</label>
          <input id="swalDate" type="date" class="form-control-bara swal2-input" style="margin:0" value="${dateStr}"></div>
          <div style="flex:1"><label class="form-label-bara">Hora</label>
          <input id="swalTime" type="time" class="form-control-bara swal2-input" style="margin:0" value="${timeStr}"></div>
        </div>
        <label class="form-label-bara">Uniforme</label>
        <select id="swalUniform" class="form-control-bara swal2-input" style="margin:0 0 12px">
          ${Object.entries(UNIFORM_LABEL).map(([k, v]) => `<option value="${k}" ${existing?.uniform === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        <label class="form-label-bara">Observaciones <span style="font-weight:400;color:var(--text-muted)">(implementos, recomendaciones)</span></label>
        <textarea id="swalNotes" class="form-control-bara swal2-textarea" style="margin:0 0 12px">${existing ? escapeHtml(existing.notes || '') : ''}</textarea>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-secondary);margin-top:0">
          <input id="swalCancelled" type="checkbox" ${existing?.cancelled ? 'checked' : ''}> Marcar como cancelado
        </label>
        ${!existing ? `
        <hr style="margin:16px 0;border-color:var(--border-color)">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-secondary);margin-bottom:8px">
          <input id="swalRepeat" type="checkbox"> Repetir semanalmente (agenda recurrente)
        </label>
        <div id="swalRepeatUntilWrap" style="display:none">
          <label class="form-label-bara">Repetir hasta</label>
          <input id="swalRepeatUntil" type="date" class="form-control-bara swal2-input" style="margin:0">
        </div>` : ''}
      </div>`,
    showCancelButton: true,
    confirmButtonText: existing ? 'Guardar' : 'Crear',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#8B0000',
    focusConfirm: false,
    didOpen: () => {
      document.getElementById('swalRepeat')?.addEventListener('change', (e) => {
        document.getElementById('swalRepeatUntilWrap').style.display = e.target.checked ? 'block' : 'none';
      });
    },
    preConfirm: () => {
      const title = document.getElementById('swalTitle').value.trim();
      const date = document.getElementById('swalDate').value;
      const time = document.getElementById('swalTime').value || '00:00';
      if (!title || !date) { Swal.showValidationMessage('Completa título y fecha'); return false; }
      const repeat = document.getElementById('swalRepeat')?.checked || false;
      const repeatUntil = document.getElementById('swalRepeatUntil')?.value || null;
      return {
        title,
        type: document.getElementById('swalType').value,
        venue: document.getElementById('swalVenue').value.trim(),
        court: document.getElementById('swalCourt').value.trim(),
        location: document.getElementById('swalVenue').value.trim(),
        uniform: document.getElementById('swalUniform').value,
        notes: document.getElementById('swalNotes').value.trim(),
        cancelled: document.getElementById('swalCancelled').checked,
        startTime: Timestamp.fromDate(new Date(`${date}T${time}:00`)),
        _date: date, _time: time, _repeat: repeat, _repeatUntil: repeatUntil
      };
    }
  }).then(async (res) => {
    if (!res.isConfirmed) return;
    const { _date, _time, _repeat, _repeatUntil, ...eventData } = res.value;
    if (existing) {
      await updateDocument(COLLECTIONS.SCHEDULES, existing.id, eventData);
      toast('Evento actualizado', 'success');
      notify({ audience: 'parents', title: eventData.cancelled ? 'Entrenamiento cancelado' : 'Cambio en la agenda', body: `${eventData.title} · ${UNIFORM_LABEL[eventData.uniform] || ''}` });
      notify({ audience: 'coaches', title: eventData.cancelled ? 'Entrenamiento cancelado' : 'Cambio en la agenda', body: `${eventData.title}` });
    } else if (_repeat && _repeatUntil) {
      const dates = [];
      let d = new Date(`${_date}T00:00:00`);
      const end = new Date(`${_repeatUntil}T00:00:00`);
      while (d <= end) { dates.push(new Date(d)); d.setDate(d.getDate() + 7); }
      showLoader(`Creando ${dates.length} eventos…`);
      for (const dt of dates) {
        const iso = dt.toISOString().slice(0, 10);
        await createDocument(COLLECTIONS.SCHEDULES, { ...eventData, startTime: Timestamp.fromDate(new Date(`${iso}T${_time}:00`)) });
      }
      hideLoader();
      toast(`Agenda recurrente creada: ${dates.length} eventos`, 'success');
      notify({ audience: 'parents', title: 'Nueva agenda recurrente', body: `${eventData.title} · ${dates.length} sesiones · Uniforme: ${UNIFORM_LABEL[eventData.uniform] || ''}` });
      notify({ audience: 'coaches', title: 'Nueva agenda recurrente', body: `${eventData.title} · ${dates.length} sesiones` });
    } else {
      await createDocument(COLLECTIONS.SCHEDULES, eventData);
      toast('Evento creado', 'success');
      notify({ audience: 'parents', title: 'Nuevo evento en la agenda', body: `${eventData.title} · ${eventData.venue || ''} · Uniforme: ${UNIFORM_LABEL[eventData.uniform] || ''}` });
      notify({ audience: 'coaches', title: 'Nuevo evento en la agenda', body: `${eventData.title} · ${eventData.venue || ''}` });
    }
  });
};

const escapeHtml = (s = '') => s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

document.addEventListener('DOMContentLoaded', init);
