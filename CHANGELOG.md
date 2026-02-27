# CHANGELOG — AMO → Kommo CRM Migration Tool

## [V1.0.0] — 2026-02-27

### Начальная версия (базовый рабочий срез)

#### Backend
- `batchMigrationService.js` — основная логика миграции: сделки, контакты, компании, задачи, заметки
  - fix: contacts/companies передаются в `_embedded` при создании сделки (POST /api/v4/leads)
  - fix: `entity_id` приводится к `Number()` для задач и заметок (Kommo API требует int)
  - fix: `Set.has(Number(t.entity_id))` — защита от несоответствия типов string/number
  - fix: `leadIdMap` заполняется для пропущенных (уже перенесённых) сделок
  - добавлено детальное логирование задач, заметок, createTasksBatch, createNotesBatch
- `migrationService.js` — вспомогательный сервис миграции
- `dataTransformer.js` — трансформация данных AMO → Kommo (поля, даты, enums)
- `fieldMapping.js` — маппинг кастомных полей
- `migration.js` — REST-маршруты: transfer-deals, rollback, create-field, sync-stages
- `kommoApi.js` — Kommo API клиент с rate limiting и логированием

#### Frontend
- `App.jsx` — главный компонент: табы (data/fields/pipelines/migration)
- `CopyDeals.jsx` — панель переноса сделок с прогрессом, ошибками и откатом
- `api.js` — HTTP-клиент к бэкенду

#### Инфраструктура
- PM2 id=8, порт 3008
- Nginx reverse proxy
- SQLite БД: `/var/www/amoschool/backups/migration.db`
- Кэш AMO: `/var/www/amoschool/backend/backups/amo_data_cache.json`
- Маппинг этапов: `/var/www/amoschool/backend/backups/stage_mapping.json`
- Маппинг полей: `/var/www/amoschool/backend/backups/field_mapping.json`

#### Бэкап
- Файлы сохранены в: `/var/www/amoschool/backend/backups/versions/V1.0.0_2026-02-27/`

---

_Следующие версии:_
- `V1.0.1` — мелкие правки и исправления багов
- `V1.1.0` — новая функция или важное исправление
