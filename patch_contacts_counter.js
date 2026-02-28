#!/usr/bin/env node
// patch_contacts_notes_counter.js
const fs = require('fs');
const path = '/var/www/amoschool/backend/src/services/batchMigrationService.js';
let src = fs.readFileSync(path, 'utf8');
const crlf = src.includes('\r\n');
src = src.replace(/\r\n/g, '\n');

// Добавить notesDetail.contacts.fetched и .transferred в блок контактных заметок (runSingleDealsTransfer)
const OLD = `        const notes = await amoApi.getContactNotes(aContactId);
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

const HAS_COUNTER = src.includes('result.notesDetail.contacts.transferred');
if (HAS_COUNTER) {
  console.log('SKIP: notesDetail.contacts уже добавлен');
} else {
  const OLD2 = `        const notes = await amoApi.getContactNotes(aContactId);
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
  const NEW2 = `        const notes = await amoApi.getContactNotes(aContactId);
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
  if (src.includes(OLD2)) {
    src = src.replace(OLD2, NEW2);
    console.log('OK: notesDetail.contacts счётчик добавлен');
  } else {
    console.log('FAIL: паттерн не найден, проверьте вручную');
  }
}

fs.writeFileSync(path, crlf ? src.replace(/\n/g, '\r\n') : src, 'utf8');
console.log('Done');
