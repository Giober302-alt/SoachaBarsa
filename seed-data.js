/**
 * @file seed-data.js
 * @description Datos de ejemplo opcionales para probar el dashboard.
 *              Se ejecuta desde configuracion-inicial.html. Bórralo cuando
 *              ya tengas datos reales cargados.
 */
import { db, COLLECTIONS } from './firebase-config.js';
import {
  collection, addDoc, doc, setDoc, Timestamp, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

export const seedDemoData = async () => {
  const log = [];

  // Categorías
  const categorias = [
    { name: 'Sub-8',  color: '#00C853' },
    { name: 'Sub-12', color: '#0D1B2A' },
    { name: 'Sub-16', color: '#00E676' }
  ];
  const catIds = [];
  for (const c of categorias) {
    const ref = await addDoc(collection(db, COLLECTIONS.CATEGORIES), { ...c, createdAt: serverTimestamp() });
    catIds.push(ref.id);
  }
  log.push(`Categorías creadas: ${categorias.map(c => c.name).join(', ')}`);

  // Entrenadores
  const coachNames = ['Carlos Ramírez', 'Diana Torres'];
  const coachIds = [];
  for (const name of coachNames) {
    const ref = await addDoc(collection(db, COLLECTIONS.COACHES), {
      displayName: name, active: true, createdAt: serverTimestamp()
    });
    coachIds.push(ref.id);
  }
  log.push(`Entrenadores creados: ${coachNames.join(', ')}`);

  // Alumnos — el primero queda vinculado a padre.demo@barsa.co para poder
  // probar el Portal de Padres de inmediato.
  const studentNames = [
    'Santiago Gómez', 'Valentina Ríos', 'Mateo Rojas',
    'Isabella Cortés', 'Samuel Pérez', 'María José Duarte'
  ];
  const studentIds = [];
  for (let i = 0; i < studentNames.length; i++) {
    const ref = await addDoc(collection(db, COLLECTIONS.STUDENTS), {
      displayName: studentNames[i],
      categoryId:  catIds[i % catIds.length],
      birthDate:   Timestamp.fromDate(new Date(2013 + (i % 5), i % 12, (i * 3) % 28 + 1)),
      parentEmail: i === 0 ? 'padre.demo@barsa.co' : null,
      active:      true,
      createdAt:   serverTimestamp()
    });
    studentIds.push(ref.id);
  }
  log.push(`Alumnos creados: ${studentNames.length} (el primero vinculado a padre.demo@barsa.co)`);

  // Asistencia de hoy (para las estadísticas del dashboard)
  const todayStr = new Date().toISOString().split('T')[0];
  for (let i = 0; i < studentIds.length; i++) {
    const status = i < 4 ? 'arrived' : (i === 4 ? 'late' : 'absent');
    await setDoc(doc(db, COLLECTIONS.ATTENDANCE, `${todayStr}_${studentIds[i]}`), {
      date: todayStr,
      studentId: studentIds[i],
      studentName: studentNames[i],
      status,
      createdAt: serverTimestamp()
    });
  }
  log.push('Asistencia de hoy registrada');

  // Pagos
  const payStatuses = ['paid', 'paid', 'pending', 'pending', 'overdue'];
  for (let i = 0; i < payStatuses.length; i++) {
    await addDoc(collection(db, COLLECTIONS.PAYMENTS), {
      studentId: studentIds[i % studentIds.length],
      studentName: studentNames[i % studentNames.length],
      amount: 80000,
      status: payStatuses[i],
      createdAt: serverTimestamp()
    });
  }
  log.push('Pagos de ejemplo creados');

  // Torneo próximo
  const nextMonth = new Date(); nextMonth.setDate(nextMonth.getDate() + 20);
  await addDoc(collection(db, COLLECTIONS.TOURNAMENTS), {
    name: 'Copa Barsa Soacha', date: Timestamp.fromDate(nextMonth), createdAt: serverTimestamp()
  });
  log.push('Torneo de ejemplo creado');

  // Horarios / eventos próximos
  const events = [
    { title: 'Entrenamiento Sub-12', type: 'Entrenamiento', location: 'Cancha 1', daysAhead: 2, hour: 16 },
    { title: 'Partido amistoso Sub-16', type: 'Partido', location: 'Cancha principal', daysAhead: 5, hour: 15 },
    { title: 'Reunión de padres', type: 'Reunión', location: 'Sede administrativa', daysAhead: 9, hour: 18 }
  ];
  for (const ev of events) {
    const d = new Date(); d.setDate(d.getDate() + ev.daysAhead); d.setHours(ev.hour, 0, 0, 0);
    await addDoc(collection(db, COLLECTIONS.SCHEDULES), {
      title: ev.title, type: ev.type, location: ev.location,
      startTime: Timestamp.fromDate(d), createdAt: serverTimestamp()
    });
  }
  log.push('Eventos de agenda creados');

  // Comunicados
  const announcements = [
    { title: 'Bienvenida a la temporada 2026', pinned: true },
    { title: 'Actualización del reglamento de asistencia', pinned: false }
  ];
  for (const a of announcements) {
    await addDoc(collection(db, COLLECTIONS.ANNOUNCEMENTS), { ...a, createdAt: serverTimestamp() });
  }
  log.push('Comunicados creados');

  return log;
};
