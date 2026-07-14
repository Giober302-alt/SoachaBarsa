/**
 * @file configuracion.js
 * @description Configuración general de la academia — Barsa Soacha Academy.
 */
import { requireAuth } from './auth.js';
import { initShell, toast, hideLoader, showLoader } from './app.js';
import { db } from './firebase-config.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const SETTINGS_DOC = 'general';

const init = async () => {
  showLoader('Cargando configuración…');
  const profile = await requireAuth('admin');
  if (!profile) return;
  initShell();

  const snap = await getDoc(doc(db, 'settings', SETTINGS_DOC));
  const data = snap.exists() ? snap.data() : {};

  document.getElementById('academyName').value = data.academyName || 'Barsa Soacha Academy';
  document.getElementById('monthlyFee').value = data.monthlyFee || 80000;
  document.getElementById('venues').value = (data.venues || []).join('\n');
  document.getElementById('contactPhone').value = data.contactPhone || '';
  document.getElementById('contactEmail').value = data.contactEmail || '';

  document.getElementById('settingsForm').addEventListener('submit', save);
  hideLoader();
};

const save = async (e) => {
  e.preventDefault();
  const payload = {
    academyName: document.getElementById('academyName').value.trim(),
    monthlyFee: Number(document.getElementById('monthlyFee').value) || 0,
    venues: document.getElementById('venues').value.split('\n').map(v => v.trim()).filter(Boolean),
    contactPhone: document.getElementById('contactPhone').value.trim(),
    contactEmail: document.getElementById('contactEmail').value.trim(),
    updatedAt: serverTimestamp()
  };
  await setDoc(doc(db, 'settings', SETTINGS_DOC), payload, { merge: true });
  toast('Configuración guardada', 'success');
};

document.addEventListener('DOMContentLoaded', init);
