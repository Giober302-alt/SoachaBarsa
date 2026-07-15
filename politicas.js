/**
 * @file politicas.js
 * @description Políticas de la academia + tratamiento de datos — Barsa Soacha Academy.
 *              Lectura para todos los perfiles autenticados; edición solo admin.
 */
import { requireAuth } from './auth.js';
import { initShell, toast, hideLoader, showLoader } from './app.js';
import { db } from './firebase-config.js';
import { doc, getDoc, setDoc, collection, getDocs, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const DEFAULT_POLICY = `1. Puntualidad: los jugadores deben llegar 10 minutos antes del entrenamiento.
2. Uniforme: asistir con el uniforme indicado en la agenda de cada sesión.
3. Pagos: la mensualidad debe estar al día para participar en torneos.
4. Comportamiento: se exige respeto hacia compañeros, entrenadores y árbitros.
5. Inasistencias: notificar al entrenador con anticipación.

Este texto es editable por el administrador desde este mismo módulo.`;

const DEFAULT_CONSENT = `La Academia Barsa Soacha recopila y trata tus datos personales (y los de tu hijo/a, si aplica) únicamente para la gestión administrativa, deportiva y de comunicación con jugadores y acudientes, conforme a la Ley 1581 de 2012 y demás normas de protección de datos vigentes en Colombia. No compartimos tu información con terceros sin tu autorización.`;

let profile = null;

const init = async () => {
  showLoader('Cargando políticas…');
  try {
    profile = await requireAuth(null);
    if (!profile) return;
    initShell();

    const isAdmin = profile.role === 'admin';
    document.getElementById('btnEditPolicy').style.display = isAdmin ? 'inline-flex' : 'none';
    document.getElementById('acceptanceLogCard').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('btnEditPolicy').addEventListener('click', openEditForm);

    await loadContent();
    if (isAdmin) await loadAcceptanceLog();
  } catch (err) {
    console.error('[Políticas] Error de inicialización:', err);
    document.getElementById('policyContent').textContent = 'No se pudo cargar (revisa que firestore.rules esté publicado). ' + (err.code || err.message || '');
  } finally {
    hideLoader();
  }
};

const loadContent = async () => {
  try {
    const [policySnap, consentSnap] = await Promise.all([
      getDoc(doc(db, 'policies', 'academyPolicies')),
      getDoc(doc(db, 'policies', 'dataConsent'))
    ]);
    document.getElementById('policyContent').textContent = policySnap.exists() ? (policySnap.data().content || DEFAULT_POLICY) : DEFAULT_POLICY;
    document.getElementById('consentContent').textContent = consentSnap.exists() ? (consentSnap.data().content || DEFAULT_CONSENT) : DEFAULT_CONSENT;
  } catch (err) {
    console.error('[Políticas] loadContent:', err);
    document.getElementById('policyContent').textContent = DEFAULT_POLICY;
    document.getElementById('consentContent').textContent = DEFAULT_CONSENT;
  }
};

const openEditForm = async () => {
  const [policySnap, consentSnap] = await Promise.all([
    getDoc(doc(db, 'policies', 'academyPolicies')),
    getDoc(doc(db, 'policies', 'dataConsent'))
  ]);
  const policyText = policySnap.exists() ? (policySnap.data().content || DEFAULT_POLICY) : DEFAULT_POLICY;
  const consentText = consentSnap.exists() ? (consentSnap.data().content || DEFAULT_CONSENT) : DEFAULT_CONSENT;

  Swal.fire({
    title: 'Editar políticas',
    width: 560,
    html: `
      <div style="text-align:left">
        <label class="form-label-bara">Reglamento y políticas de la academia</label>
        <textarea id="editPolicy" class="form-control-bara swal2-textarea" style="margin:0 0 14px;min-height:140px">${policyText}</textarea>
        <label class="form-label-bara">Texto de tratamiento de datos personales <span style="font-weight:400;color:var(--text-muted)">(se muestra al aceptar por primera vez)</span></label>
        <textarea id="editConsent" class="form-control-bara swal2-textarea" style="margin:0;min-height:110px">${consentText}</textarea>
      </div>`,
    showCancelButton: true, confirmButtonText: 'Guardar', cancelButtonText: 'Cancelar', confirmButtonColor: '#00C853',
    focusConfirm: false,
    preConfirm: () => ({
      policy: document.getElementById('editPolicy').value.trim(),
      consent: document.getElementById('editConsent').value.trim()
    })
  }).then(async (res) => {
    if (!res.isConfirmed) return;
    await Promise.all([
      setDoc(doc(db, 'policies', 'academyPolicies'), { content: res.value.policy, updatedAt: serverTimestamp(), updatedBy: profile.displayName || '' }),
      setDoc(doc(db, 'policies', 'dataConsent'), { content: res.value.consent, updatedAt: serverTimestamp(), updatedBy: profile.displayName || '' })
    ]);
    toast('Políticas actualizadas', 'success');
    loadContent();
  });
};

const loadAcceptanceLog = async () => {
  const el = document.getElementById('acceptanceLog');
  try {
    const snap = await getDocs(collection(db, 'policyAcceptances'));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.acceptedAt?.toMillis?.() || 0) - (a.acceptedAt?.toMillis?.() || 0));
    if (list.length === 0) { el.innerHTML = `<p style="font-size:13px;color:var(--text-muted)">Nadie ha aceptado todavía.</p>`; return; }
    el.innerHTML = `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:560px">
      <thead><tr style="text-align:left;border-bottom:1px solid var(--border-color)">
        <th style="padding:8px 12px;font-size:11.5px;color:var(--text-muted)">Usuario</th>
        <th style="padding:8px 12px;font-size:11.5px;color:var(--text-muted)">Rol</th>
        <th style="padding:8px 12px;font-size:11.5px;color:var(--text-muted)">Fecha</th>
        <th style="padding:8px 12px;font-size:11.5px;color:var(--text-muted)">IP</th>
      </tr></thead>
      <tbody>
        ${list.map(a => {
          const d = a.acceptedAt?.toDate ? a.acceptedAt.toDate() : null;
          return `<tr style="border-bottom:1px solid var(--border-color)">
            <td style="padding:8px 12px;font-size:13px">${escapeHtml(a.displayName || a.email || a.id)}</td>
            <td style="padding:8px 12px;font-size:12.5px;color:var(--text-secondary)">${escapeHtml(a.role || '—')}</td>
            <td style="padding:8px 12px;font-size:12.5px;color:var(--text-secondary)">${d ? d.toLocaleString('es-CO') : '—'}</td>
            <td style="padding:8px 12px;font-size:12.5px;color:var(--text-secondary)">${escapeHtml(a.ip || '—')}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;
  } catch (err) {
    console.error('[Políticas] Error cargando registro:', err);
    el.innerHTML = `<p style="font-size:13px;color:#dc3545">No se pudo cargar el registro.</p>`;
  }
};

const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

document.addEventListener('DOMContentLoaded', init);
