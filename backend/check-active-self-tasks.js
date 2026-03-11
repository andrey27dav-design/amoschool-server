const fs = require('fs-extra');
const cache = fs.readJsonSync('/var/www/amoschool/backend/backups/amo_cache.json');
const tasks = [...(cache.leadTasks || []), ...(cache.tasks || [])];
const idx = fs.existsSync('/var/www/amoschool/backend/backups/migration_index.json')
  ? fs.readJsonSync('/var/www/amoschool/backend/backups/migration_index.json') : {};
const leads_idx = idx.leads || {};

const r = tasks.filter(t =>
  !t.is_completed &&
  t.created_by && t.responsible_user_id &&
  t.created_by === t.responsible_user_id &&
  t.task_type_id !== 1 &&
  t.entity_type === 'leads' &&
  leads_idx[String(t.entity_id)] // deal already migrated
).slice(0, 5).map(t => ({
  taskId: t.id,
  entityId: t.entity_id,
  kommoLeadId: leads_idx[String(t.entity_id)],
  typeId: t.task_type_id,
  createdBy: t.created_by,
  text: (t.text || '').substring(0, 50),
}));

console.log(JSON.stringify(r, null, 2));
