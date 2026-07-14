/**
 * @file notifications.js
 * @description Helper de notificaciones internas — Barsa Soacha Academy.
 *              No hay WhatsApp automático gratis sin un proveedor de pago
 *              (Twilio/Meta Cloud API); en su lugar se ofrece un botón
 *              "Compartir por WhatsApp" que abre wa.me con el mensaje listo
 *              para que el staff lo reenvíe manualmente, sin costo.
 */
import { db } from './firebase-config.js';
import { collection, addDoc, query, where, orderBy, limit, getDocs, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

export const notify = async ({ audience = null, parentEmail = null, title, body, link = '' }) => {
  try {
    await addDoc(collection(db, 'notifications'), {
      audience, parentEmail: parentEmail ? parentEmail.toLowerCase() : null,
      title, body, link, createdAt: serverTimestamp()
    });
  } catch (err) {
    console.error('[notifications] No se pudo crear la notificación:', err);
  }
};

export const fetchNotificationsFor = async ({ role, email }) => {
  const results = [];
  const tryQuery = async (q) => {
    try { const snap = await getDocs(q); snap.forEach(d => results.push({ id: d.id, ...d.data() })); }
    catch (err) { console.error('[notifications] error consultando:', err); }
  };

  await tryQuery(query(collection(db, 'notifications'), where('audience', '==', 'all'), orderBy('createdAt', 'desc'), limit(15)));
  if (role === 'parent') {
    await tryQuery(query(collection(db, 'notifications'), where('audience', '==', 'parents'), orderBy('createdAt', 'desc'), limit(15)));
    if (email) await tryQuery(query(collection(db, 'notifications'), where('parentEmail', '==', email.toLowerCase()), orderBy('createdAt', 'desc'), limit(15)));
  } else {
    await tryQuery(query(collection(db, 'notifications'), where('audience', '==', 'coaches'), orderBy('createdAt', 'desc'), limit(15)));
  }

  const seen = new Set();
  return results
    .filter(n => (seen.has(n.id) ? false : (seen.add(n.id), true)))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
    .slice(0, 15);
};

export const waShareUrl = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;

// Enlace directo a un número (formato libre: el usuario lo escribe con o sin
// espacios/guiones/+; aquí se limpia a solo dígitos). Sigue siendo un envío
// MANUAL con un clic — WhatsApp no permite automatizarlo gratis.
export const waDirectUrl = (phone, text) => {
  const digits = String(phone || '').replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
};

export const renderNotificationBell = async (containerId, { role, email }) => {
  const el = document.getElementById(containerId);
  if (!el) return;
  const items = await fetchNotificationsFor({ role, email });
  if (items.length === 0) {
    el.innerHTML = `<p style="font-size:13px;color:var(--text-muted);padding:12px 0">Sin notificaciones por ahora.</p>`;
    return;
  }
  el.innerHTML = items.map(n => `
    <div style="padding:10px 0;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;gap:10px;align-items:start">
      <div style="min-width:0">
        <p style="font-size:13px;font-weight:600">${escapeHtml(n.title || '')}</p>
        <p style="font-size:12.5px;color:var(--text-secondary);margin-top:2px">${escapeHtml(n.body || '')}</p>
      </div>
      <a href="${waShareUrl((n.title || '') + ' — ' + (n.body || ''))}" target="_blank" rel="noopener" title="Compartir por WhatsApp" style="flex-shrink:0;color:#25D366;font-size:16px"><i class="fab fa-whatsapp"></i></a>
    </div>`).join('');
};

const escapeHtml = (s = '') => s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
