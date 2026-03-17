// preflight_27212311.js — проверка перед переносом сделки 27212311
const fse = require('fs-extra');

const CACHE = '/var/www/amoschool/backend/backups/amo_data_cache.json';
const IDX   = '/var/www/amoschool/backend/backups/migration_index.json';

const LEAD_ID = 27212311;

const cache = fse.readJsonSync(CACHE);
const idx   = fse.readJsonSync(IDX);

// --- Найти сделку ---
const lead = (cache.leads || []).find(l => l.id === LEAD_ID);
if (!lead) { console.log('❌ Сделка НЕ НАЙДЕНА в кэше!'); process.exit(1); }

console.log('=== СДЕЛКА ===');
console.log(`  ID: ${lead.id}`);
console.log(`  Название: ${lead.name}`);
console.log(`  Этап (status_id): ${lead.status_id}`);
console.log(`  Ответственный (AMO user_id): ${lead.responsible_user_id}`);

// --- Уже перенесена? ---
const alreadyLeadId = (idx.leads || {})[String(LEAD_ID)];
console.log(`\n=== В ИНДЕКСЕ ===`);
console.log(`  Уже перенесена: ${alreadyLeadId ? '❌ ДА → Kommo#' + alreadyLeadId : '✅ НЕТ (новая)'}`);

// --- Контакты ---
const contactIds = ((lead._embedded && lead._embedded.contacts) || []).map(c => c.id);
console.log(`\n=== КОНТАКТЫ ===`);
console.log(`  Привязаны к сделке: ${contactIds.join(', ') || 'нет'}`);
contactIds.forEach(cid => {
  const alreadyC = (idx.contacts || {})[String(cid)];
  const c = (cache.contacts || []).find(x => x.id === cid);
  console.log(`  AMO#${cid} "${c ? c.name : '?'}" → ${alreadyC ? 'Уже в Kommo#'+alreadyC : 'не перенесён'}`);
});

// --- Компании ---
const compIds = ((lead._embedded && lead._embedded.companies) || []).map(c => c.id);
console.log(`\n=== КОМПАНИИ ===`);
console.log(`  Привязаны: ${compIds.join(', ') || 'нет'}`);

// --- Задачи ---
const allTasks = cache.tasks || [];
const leadTasks    = allTasks.filter(t => t.entity_type === 'leads'    && t.entity_id === LEAD_ID);
const contactTasks = allTasks.filter(t => t.entity_type === 'contacts' && contactIds.includes(t.entity_id));
console.log(`\n=== ЗАДАЧИ ===`);
console.log(`  Задачи сделки:   ${leadTasks.length} (завершённых: ${leadTasks.filter(t=>t.is_completed).length})`);
console.log(`  Задачи контактов: ${contactTasks.length} (завершённых: ${contactTasks.filter(t=>t.is_completed).length})`);
leadTasks.forEach(t => {
  const already = (idx.tasks_leads || {})[String(t.id)];
  console.log(`  [LEAD] AMO#${t.id} "${String(t.text||'').substring(0,40)}" cmp=${t.is_completed} → ${already ? 'Kommo#'+already : 'не перенесена'}`);
});
contactTasks.forEach(t => {
  const already = (idx.tasks_contacts || {})[String(t.id)];
  console.log(`  [CT]   AMO#${t.id} "${String(t.text||'').substring(0,40)}" cmp=${t.is_completed} → ${already ? 'Kommo#'+already : 'не перенесена'}`);
});

// --- Заметки в кэше ---
const leadNotes = (cache.notes || []).filter(n => n.entity_type === 'leads' && n.entity_id === LEAD_ID);
console.log(`\n=== ЗАМЕТКИ В КЭШЕ ===`);
console.log(`  Заметки сделки в кэше: ${leadNotes.length}`);
if (leadNotes.length > 0) {
  leadNotes.slice(0,5).forEach(n => {
    const already = (idx.notes_leads || {})[String(n.id)];
    console.log(`  AMO#${n.id} type=${n.note_type} → ${already ? 'Kommo#'+already : 'не перенесена'}`);
  });
}

console.log('\n✅ Диагностика завершена.');
