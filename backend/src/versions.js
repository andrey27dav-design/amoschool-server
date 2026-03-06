// CHANGELOG data — version descriptions for UI display
// Used by /api/version endpoint to return description alongside version number
const VERSIONS = {
  'V1.5.53': 'Миграция завершена: все 146 сделок AMO перенесены в Kommo. Добавлены оставшиеся 2 сделки (Natalia, Evgenia).',
  'V1.6.0': 'Исправлены счётчики: авто-сброс baseline при загрузке новых данных AMO. Счётчики больше не загрязняются данными из другой воронки.',
  'V1.6.1': 'В предупреждениях показываются AMO+Kommo ID. Добавлена кнопка «Повторить пакет» и endpoint retry.',
  'V1.6.2': 'Авто-retry в createNotesBatch/createTasksBatch с per-item fallback. Обработка частичных успехов при ошибках API.',
  'V1.6.3': 'Маппинг воронок и менеджеров сохраняется между перезагрузками страницы (localStorage). Авто-подгрузка при открытии.',
  'V1.6.4': 'Информативные предупреждения: детальные ID AMO/Kommo для контактов, компаний и сделок в batch warnings с раскрывающимися подробностями.',
  'V1.6.5': 'Fix: deploy.sh перезапускает правильный PM2 процесс (id=7 amoschool вместо id=8 kineziolog).',
  'V1.6.6': 'Описание версии отображается в UI. CHANGELOG восстановлен с V1.5.53. API /api/version возвращает описание.',
};

module.exports = VERSIONS;
