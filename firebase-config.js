/**
 * @file firebase-config.js
 * @description Configuración central de Firebase para Barsa Soacha Academy.
 *              ESTRUCTURA PLANA: todos los archivos en la raíz del repositorio.
 *
 *  ╔══════════════════════════════════════════════════════════════════╗
 *  ║  INSTRUCCIONES DE CONFIGURACIÓN                                 ║
 *  ║  1. Crea un proyecto en https://console.firebase.google.com     ║
 *  ║  2. Activa Authentication > Email/Password                      ║
 *  ║  3. Activa Firestore Database (modo producción)                 ║
 *  ║  4. Activa Storage                                              ║
 *  ║  5. Ve a Configuración del proyecto > Tus apps > Web            ║
 *  ║  6. Reemplaza los valores de FIREBASE_CONFIG abajo              ║
 *  ╚══════════════════════════════════════════════════════════════════╝
 *
 * @module FirebaseConfig
 * @version 1.1.0
 */

import { initializeApp }   from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth }         from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getFirestore }    from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { getStorage }      from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js';

// ─── ⚠️ REEMPLAZA ESTOS VALORES CON LOS DE TU PROYECTO FIREBASE ─────────────
const FIREBASE_CONFIG = {
apiKey: "AIzaSyAEvI3p3jP6Mgc4iCka1Wd_1FdhF9Bx7ZQ",
  authDomain: "barsa-soacha.firebaseapp.com",
  projectId: "barsa-soacha",
  storageBucket: "barsa-soacha.firebasestorage.app",
  messagingSenderId: "588228650490",
  appId: "1:588228650490:web:0e00c78acdbb8bc1d1b043"
};  
// ─────────────────────────────────────────────────────────────────────────────

// ─── Inicialización ────────────────────────────────────────────────────────────
const firebaseApp = initializeApp(FIREBASE_CONFIG);

export const auth    = getAuth(firebaseApp);
export const db      = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);

// ─── Colecciones de Firestore ─────────────────────────────────────────────────
export const COLLECTIONS = {
  USERS:         'users',
  STUDENTS:      'students',
  PARENTS:       'parents',
  COACHES:       'coaches',
  CATEGORIES:    'categories',
  ATTENDANCE:    'attendance',
  PAYMENTS:      'payments',
  TOURNAMENTS:   'tournaments',
  SCHEDULES:     'schedules',
  NOTIFICATIONS: 'notifications',
  ANNOUNCEMENTS: 'announcements',
  REPORTS:       'reports',
  SETTINGS:      'settings'
};

// ─── Roles del sistema ────────────────────────────────────────────────────────
export const ROLES = {
  ADMIN:       { key: 'admin',       label: 'Administrador',    level: 4 },
  COORDINATOR: { key: 'coordinator', label: 'Coordinador',      level: 3 },
  COACH:       { key: 'coach',       label: 'Entrenador',       level: 2 },
  PARENT:      { key: 'parent',      label: 'Padre de familia', level: 1 }
};

export default firebaseApp;
