# CHANGELOG — AMO → Kommo CRM Migration Tool

## [V1.6.6] — 2026-03-06
### Отображение описания версии в UI
- Backend: `/api/version` возвращает `description` из `versions.js`
- Frontend: рядом с номером версии показывается описание изменений
- CHANGELOG восстановлен с V1.5.53

## [V1.6.5] — 2026-03-06
### Fix: deploy.sh PM2 process ID
- `deploy.sh` перезапускал PM2 id=8 (kineziolog) вместо id=7 (amoschool-backend)
- Исправлено на `pm2 restart 7`

## [V1.6.4] — 2026-03-06
### Информативные предупреждения batch-миграции
- `addWarning()` принимает 3-й параметр `details[]`
- Сделки без контактов → список `Сделка AMO#ID (название)`
- Уже перенесённые компании → `Компания AMO#X → Kommo#Y (привязана к сделкам: ...)`
- Уже перенесённые контакты → `Контакт AMO#X → Kommo#Y (нужен для сделок: ...)`
- Frontend: раскрывающийся блок «Подробности» в каждом предупреждении

## [V1.6.3] — 2026-03-06
### Персистентность маппингов
- Маппинг воронок и менеджеров сохраняется в localStorage
- Авто-подгрузка при открытии страницы (не нужно заново выбирать)

## [V1.6.2] — 2026-03-06
### Авто-retry API запросов
- `createNotesBatch` / `createTasksBatch` — авто-retry при ошибках с per-item fallback
- Обработка частичных успехов: если 3 из 5 заметок создались — они сохраняются

## [V1.6.1] — 2026-03-06
### ID в предупреждениях + кнопка Retry
- В предупреждениях показываются AMO+Kommo ID сущностей
- Добавлена кнопка «Повторить пакет» (retry) в UI
- Backend endpoint `POST /api/migration/batch-retry`

## [V1.6.0] — 2026-03-05
### Исправление счётчиков
- Авто-сброс `session_baseline.json` при загрузке новых данных AMO
- Baseline-relative подсчёт pending/migrated — исключает «грязные» данные из старых воронок
- Файлы: `batchMigrationService.js`, `migration.js` (routes)

## [V1.5.53] — 2026-03-05
### Миграция завершена
- Все 146/146 сделок AMO перенесены в Kommo
- Добавлены последние 2 сделки: AMO#30977261 (Natalia), AMO#29727995 (Evgenia)
- Первая полностью рабочая версия миграции

---

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
