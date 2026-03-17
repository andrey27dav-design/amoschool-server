#!/usr/bin/env node
// patch_contacts_counter2.js — добавить счётчики в блок contact notes
const fs = require('fs');
const path = '/var/www/amoschool/backend/src/services/batchMigrationService.js';
let src = fs.readFileSync(path, 'utf8');
const crlf = src.includes('\r\n');
src = src.replace(/\r\n/g, '\n');

const OLD = `        const notes = await amoApi.getContactNotes(aContactId);
        if (notes.length > 0) {
          const notesData = notes.map(n => ({
            entity_id:  Number(kContactId),
            note_type:  n.note_type || 'common',
            params:     n.params    || {},
          }));
          const created = await kommoApi.createNotesBatch('contacts', notesData);
          created.forEach(n => { if (n) { result.createdIds.notes.push(n.id); result.transferred.notes++; } });
        }
      } catch (e) { result.warnings.push('Заметки контакта AMO#' + aContactId + ': ' + e.message); }`;

const NEW = `        const notes = await amoApi.getContactNotes(aContactId);
        result.notesDetail.contacts.fetched += notes.length;
        if (notes.length > 0) {
          const notesData = notes.map(n => ({
            entity_id:  Number(kContactId),
            note_type:  n.note_type || 'common',
            params:     n.params    || {},
          }));
          const created = await kommoApi.createNotesBatch('contacts', notesData);
          created.forEach(n => { if (n) { result.createdIds.notes.push(n.id); result.transferred.notes++; result.notesDetail.contacts.transferred++; } });
        }
      } catch (e) { result.warnings.push('Заметки контакта AMO#' + aContactId + ': ' + e.message); }`;

if (src.includes(OLD)) {
  src = src.replace(OLD, NEW);
  console.log('OK: notesDetail.contacts счётчики добавлены');
} else {
  // Попробуем найти частично что есть
  const idx = src.indexOf('getContactNotes(aContactId)');
  if (idx >= 0) {
    console.log('Контекст вокруг getContactNotes:');
    console.log(JSON.stringify(src.slice(idx - 10, idx + 350)));
  } else {
    console.log('FAIL: getContactNotes не найден');
  }
}

fs.writeFileSync(path, crlf ? src.replace(/\n/g, '\r\n') : src, 'utf8');
console.log('Done');
