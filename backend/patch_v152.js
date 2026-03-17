/**
 * V1.5.2 patch: 
 * Fix #2 — warning when user mapping not found (fallback silently to first user)  
 * Fix #4 — warning when lead stage not in stageMapping (single transfer)
 */
const fs = require('fs');
const path = '/var/www/amoschool/backend/src/services/batchMigrationService.js';

let src = fs.readFileSync(path, 'utf8');
let count = 0;

function patch(description, from, to) {
  if (!src.includes(from)) {
    console.error(`PATCH FAILED: "${description}" — pattern not found`);
    process.exit(1);
  }
  src = src.replace(from, to);
  count++;
  console.log(`OK: ${description}`);
}

// ─────────────────────────────────────────────────────────────────
// FIX #4: Add stage unmapped warning in runSingleDealsTransfer
// Insert after selectedLeads is defined and result.warnings is available
// We insert right after the fieldMappings line (before // --- User mapping)
// ─────────────────────────────────────────────────────────────────
patch(
  'Fix #4: stage unmapped warning in runSingleDealsTransfer',
  `  const fieldMappings = loadFieldMapping() || { leads: null, contacts: null, companies: null };

  // --- User mapping (AMO responsible_user_id → Kommo responsible_user_id) ---`,
  `  const fieldMappings = loadFieldMapping() || { leads: null, contacts: null, companies: null };

  // --- Fix #4: Warn about leads whose stage is not in stageMapping ---
  if (stageMapping && Object.keys(stageMapping).length > 0) {
    const unmappedStages = new Set();
    selectedLeads.forEach(l => {
      if (l.status_id && !stageMapping[l.status_id] && ![142, 143].includes(l.status_id))
        unmappedStages.add(l.status_id);
    });
    if (unmappedStages.size > 0) {
      result.warnings.push(
        \`Этапы [\${[...unmappedStages].join(', ')}] отсутствуют в маппинге — сделки попадут в первый доступный этап Kommo. Выполните "Синхронизировать этапы" для создания недостающих этапов.\`
      );
    }
  }

  // --- User mapping (AMO responsible_user_id → Kommo responsible_user_id) ---`
);

// ─────────────────────────────────────────────────────────────────
// FIX #2a: Company user fallback warning
// ─────────────────────────────────────────────────────────────────
patch(
  'Fix #2a: company user fallback warning',
  `      // Determine Kommo user: from entity's own mapping, fallback to first configured mapping
      const compKommoUserId = tc.responsible_user_id || (Object.keys(userMap).length > 0 ? Number(Object.values(userMap)[0]) : null);`,
  `      // Determine Kommo user: from entity's own mapping, fallback to first configured mapping
      if (!tc.responsible_user_id && item.responsible_user_id) {
        const _fbUid = Object.keys(userMap).length > 0 ? Number(Object.values(userMap)[0]) : null;
        result.warnings.push(\`Нет маппинга пользователя amo_id=\${item.responsible_user_id} для компании AMO#\${amoId}\${_fbUid ? \`, назначен kommo_id=\${_fbUid}\` : ', ответственный не назначен'}\`);
      }
      const compKommoUserId = tc.responsible_user_id || (Object.keys(userMap).length > 0 ? Number(Object.values(userMap)[0]) : null);`
);

// ─────────────────────────────────────────────────────────────────
// FIX #2b: Contact user fallback warning
// ─────────────────────────────────────────────────────────────────
patch(
  'Fix #2b: contact user fallback warning',
  `      // Determine Kommo user: from entity's own mapping, fallback to first configured mapping
      const contKommoUserId = tct.responsible_user_id || (Object.keys(userMap).length > 0 ? Number(Object.values(userMap)[0]) : null);`,
  `      // Determine Kommo user: from entity's own mapping, fallback to first configured mapping
      if (!tct.responsible_user_id && item.responsible_user_id) {
        const _fbUid = Object.keys(userMap).length > 0 ? Number(Object.values(userMap)[0]) : null;
        result.warnings.push(\`Нет маппинга пользователя amo_id=\${item.responsible_user_id} для контакта AMO#\${amoId}\${_fbUid ? \`, назначен kommo_id=\${_fbUid}\` : ', ответственный не назначен'}\`);
      }
      const contKommoUserId = tct.responsible_user_id || (Object.keys(userMap).length > 0 ? Number(Object.values(userMap)[0]) : null);`
);

// ─────────────────────────────────────────────────────────────────
// FIX #2c: Lead user fallback warning (skipped leads PATCH path)
// When tl.responsible_user_id is null but lead has responsible_user_id
// ─────────────────────────────────────────────────────────────────
patch(
  'Fix #2c: lead user fallback warning (skipped leads)',
  `    // Always update responsible_user_id in separate PATCH — never blocked by custom field errors
    if (tl.responsible_user_id) {
      try { await kommoApi.updateLead(kommoId, { responsible_user_id: tl.responsible_user_id }); }
      catch (e) { result.warnings.push(\`Обновление менеджера сделки AMO#\${amoId}: \${e.message}\`); }
    }`,
  `    // Always update responsible_user_id in separate PATCH — never blocked by custom field errors
    if (tl.responsible_user_id) {
      try { await kommoApi.updateLead(kommoId, { responsible_user_id: tl.responsible_user_id }); }
      catch (e) { result.warnings.push(\`Обновление менеджера сделки AMO#\${amoId}: \${e.message}\`); }
    } else if (aLead.responsible_user_id) {
      const _fbUid = Object.keys(userMap).length > 0 ? Number(Object.values(userMap)[0]) : null;
      result.warnings.push(\`Нет маппинга пользователя amo_id=\${aLead.responsible_user_id} для сделки AMO#\${amoId}\${_fbUid ? \`, назначен kommo_id=\${_fbUid}\` : ', ответственный не назначен'}\`);
    }`
);

fs.writeFileSync(path, src, 'utf8');
console.log(`\nDone. ${count} patches applied.`);
