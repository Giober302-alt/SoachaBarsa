/**
 * @file alumnos.js
 * @description Gestión de alumnos — Barsa Soacha Academy.
 */
import { requireAuth } from './auth.js';
import {
  initShell, toast, showConfirm, hideLoader, showLoader,
  createDocument, updateDocument, deleteDocument, subscribeCollection, getCollection, formatDate
} from './app.js';
import { COLLECTIONS } from './firebase-config.js';
import { Timestamp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

let students   = [];
let categories = [];

const init = async () => {
  showLoader('Cargando alumnos…');
  const profile = await requireAuth('coordinator');
  if (!profile) return;
  initShell();

  document.getElementById('btnNewStudent')?.addEventListener('click', () => openForm());
  document.getElementById('btnImportCsv')?.addEventListener('click', () => document.getElementById('csvFileInput').click());
  document.getElementById('csvFileInput')?.addEventListener('change', handleCsvImport);

  categories = await getCollection(COLLECTIONS.CATEGORIES);

  subscribeCollection(COLLECTIONS.STUDENTS, (list) => {
    students = list;
    render(list);
    hideLoader();
  });
};

const categoryName = (id) => categories.find(c => c.id === id)?.name || '—';
const studentCategoryIds = (s) => (s.categoryIds && s.categoryIds.length) ? s.categoryIds : (s.categoryId ? [s.categoryId] : []);
const categoryNamesFor = (s) => {
  const ids = studentCategoryIds(s);
  if (ids.length === 0) return '—';
  return ids.map(id => categoryName(id)).join(', ');
};

const render = (list) => {
  const el = document.getElementById('studentsContainer');
  if (!el) return;

  if (list.length === 0) {
    el.innerHTML = `<div class="empty-widget"><i class="fas fa-users"></i><p>Sin alumnos todavía. Crea el primero con "Nuevo alumno".</p></div>`;
    return;
  }

  el.innerHTML = `<div class="card-bara"><div class="card-body-bara" style="padding:0">
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="text-align:left;border-bottom:1px solid var(--border-color)">
        <th style="padding:12px 20px;font-size:12px;color:var(--text-muted)">Alumno</th>
        <th style="padding:12px 20px;font-size:12px;color:var(--text-muted)">Categoría</th>
        <th style="padding:12px 20px;font-size:12px;color:var(--text-muted)">Fecha de nacimiento</th>
        <th style="padding:12px 20px;font-size:12px;color:var(--text-muted)">Estado</th>
        <th style="padding:12px 20px;font-size:12px;color:var(--text-muted)"></th>
      </tr></thead>
      <tbody>
        ${list.map(s => `
        <tr style="border-bottom:1px solid var(--border-color)">
          <td style="padding:12px 20px;font-weight:600;font-size:13.5px">${escapeHtml(s.displayName || '—')}</td>
          <td style="padding:12px 20px;font-size:13px;color:var(--text-secondary)">${escapeHtml(categoryNamesFor(s))}</td>
          <td style="padding:12px 20px;font-size:13px;color:var(--text-secondary)">${formatDate(s.birthDate)}</td>
          <td style="padding:12px 20px"><span class="badge-status ${s.active === false ? 'badge-overdue' : 'badge-paid'}">${s.active === false ? 'Inactivo' : 'Activo'}</span></td>
          <td style="padding:12px 20px;white-space:nowrap">
            <a class="btn-outline-bara" style="padding:6px 10px" href="./alumno-detalle.html?id=${s.id}"><i class="fas fa-id-card"></i></a>
            <button class="btn-outline-bara" style="padding:6px 10px" data-edit="${s.id}"><i class="fas fa-pen"></i></button>
            <button class="btn-outline-bara" style="padding:6px 10px;color:#dc3545;border-color:#dc3545" data-delete="${s.id}"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div></div>`;

  el.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
    openForm(students.find(s => s.id === btn.dataset.edit));
  }));
  el.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', async () => {
    const ok = await showConfirm('¿Eliminar alumno?', 'Esta acción no se puede deshacer.', 'Eliminar');
    if (ok) {
      await deleteDocument(COLLECTIONS.STUDENTS, btn.dataset.delete);
      toast('Alumno eliminado', 'success');
    }
  }));
};

const openForm = (existing = null) => {
  const existingIds = existing ? studentCategoryIds(existing) : [];
  const checkboxes = categories.map(c => `
    <label style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13.5px">
      <input type="checkbox" class="swalCategoryChk" value="${c.id}" ${existingIds.includes(c.id) ? 'checked' : ''}> ${escapeHtml(c.name)}
    </label>`).join('');
  const birth = existing?.birthDate ? (existing.birthDate.toDate ? existing.birthDate.toDate() : new Date(existing.birthDate)) : null;
  const birthStr = birth ? birth.toISOString().slice(0, 10) : '';

  Swal.fire({
    title: existing ? 'Editar alumno' : 'Nuevo alumno',
    html: `
      <div style="text-align:left">
        <label class="form-label-bara">Nombre completo</label>
        <input id="swalName" class="form-control-bara swal2-input" style="margin:0 0 12px" value="${existing ? escapeHtml(existing.displayName || '') : ''}">
        <label class="form-label-bara">Documento del alumno <span style="font-weight:400;color:var(--text-muted)">(clave para que el padre se registre)</span></label>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <select id="swalDocType" class="form-control-bara swal2-input" style="margin:0;max-width:100px">
            ${['RC','TI','CC','CE'].map(t => `<option ${existing?.documentType === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
          <input id="swalDocNumber" class="form-control-bara swal2-input" style="margin:0;flex:1" placeholder="Número" value="${existing ? escapeHtml(existing.documentNumber || '') : ''}">
        </div>
        <label class="form-label-bara">Categorías <span style="font-weight:400;color:var(--text-muted)">(puede pertenecer a varias)</span></label>
        <div style="border:1.5px solid var(--border-color);border-radius:10px;padding:8px 14px;margin:0 0 12px;max-height:150px;overflow-y:auto">
          ${checkboxes || '<p style="font-size:12.5px;color:var(--text-muted)">Crea categorías primero.</p>'}
        </div>
        <label class="form-label-bara">Fecha de nacimiento</label>
        <input id="swalBirth" type="date" class="form-control-bara swal2-input" style="margin:0 0 12px" value="${birthStr}">
        <label class="form-label-bara">Correo del padre/acudiente <span style="font-weight:400;color:var(--text-muted)">(para el Portal de Padres)</span></label>
        <input id="swalParentEmail" type="email" class="form-control-bara swal2-input" style="margin:0 0 12px" placeholder="padre@correo.com" value="${existing ? escapeHtml(existing.parentEmail || '') : ''}">
        <label class="form-label-bara">Teléfono del acudiente <span style="font-weight:400;color:var(--text-muted)">(WhatsApp, con indicativo: 57...)</span></label>
        <input id="swalParentPhone" class="form-control-bara swal2-input" style="margin:0 0 12px" placeholder="57 300 1234567" value="${existing ? escapeHtml(existing.parentPhone || '') : ''}">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-secondary)">
          <input id="swalActive" type="checkbox" ${existing?.active === false ? '' : 'checked'}> Activo
        </label>
      </div>`,
    showCancelButton: true,
    confirmButtonText: existing ? 'Guardar' : 'Crear',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#00C853',
    focusConfirm: false,
    preConfirm: () => {
      const displayName = document.getElementById('swalName').value.trim();
      if (!displayName) { Swal.showValidationMessage('Escribe un nombre'); return false; }
      const birthVal = document.getElementById('swalBirth').value;
      return {
        displayName,
        documentType: document.getElementById('swalDocType').value,
        documentNumber: document.getElementById('swalDocNumber').value.trim(),
        categoryIds: Array.from(document.querySelectorAll('.swalCategoryChk:checked')).map(el => el.value),
        categoryId: null,
        birthDate: birthVal ? Timestamp.fromDate(new Date(birthVal + 'T00:00:00')) : null,
        parentEmail: document.getElementById('swalParentEmail').value.trim().toLowerCase() || null,
        parentPhone: document.getElementById('swalParentPhone').value.trim() || null,
        active: document.getElementById('swalActive').checked
      };
    }
  }).then(async (res) => {
    if (!res.isConfirmed) return;
    if (existing) {
      await updateDocument(COLLECTIONS.STUDENTS, existing.id, res.value);
      toast('Alumno actualizado', 'success');
    } else {
      await createDocument(COLLECTIONS.STUDENTS, res.value);
      toast('Alumno creado', 'success');
    }
  });
};

const escapeHtml = (s = '') => s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

// ─── Carga masiva por CSV ───────────────────────────────────────────────────
// Columnas esperadas (con encabezado, separadas por coma):
// nombre,tipoDocumento,numeroDocumento,fechaNacimiento(AAAA-MM-DD),categorias(separadas por ;),correoPadre,telefonoPadre
const parseCsv = (text) => {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];
  const rows = lines.slice(1);
  return rows.map(line => {
    const cols = line.split(',').map(c => c.trim());
    return {
      displayName: cols[0] || '',
      documentType: cols[1] || 'RC',
      documentNumber: cols[2] || '',
      birthDate: cols[3] || '',
      categoryNames: (cols[4] || '').split(';').map(c => c.trim()).filter(Boolean),
      parentEmail: (cols[5] || '').toLowerCase() || null,
      parentPhone: cols[6] || null
    };
  }).filter(r => r.displayName);
};

const handleCsvImport = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length === 0) {
    toast('El archivo no tiene filas válidas. Revisa el formato.', 'warning');
    e.target.value = '';
    return;
  }
  const ok = await showConfirm(`¿Importar ${rows.length} alumno(s)?`, 'Se crearán como nuevos registros.', 'Importar');
  e.target.value = '';
  if (!ok) return;

  showLoader(`Importando ${rows.length} alumnos…`);
  let created = 0, errors = 0;
  for (const row of rows) {
    try {
      const categoryIds = row.categoryNames
        .map(name => categories.find(c => c.name.toLowerCase() === name.toLowerCase())?.id)
        .filter(Boolean);
      const birth = row.birthDate ? new Date(row.birthDate + 'T00:00:00') : null;
      await createDocument(COLLECTIONS.STUDENTS, {
        displayName: row.displayName,
        documentType: row.documentType,
        documentNumber: row.documentNumber,
        categoryIds, categoryId: null,
        birthDate: birth && !isNaN(birth) ? Timestamp.fromDate(birth) : null,
        parentEmail: row.parentEmail, parentPhone: row.parentPhone,
        active: true
      });
      created++;
    } catch (err) { console.error('[Import CSV]', err); errors++; }
  }
  hideLoader();
  toast(`Importación completa: ${created} creados${errors ? `, ${errors} con error` : ''}`, errors ? 'warning' : 'success', 5000);
};

document.addEventListener('DOMContentLoaded', init);
