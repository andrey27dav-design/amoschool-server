#!/bin/bash
# =============================================================
# deploy.sh — единый скрипт деплоя для amoschool migration app
# Использование:
#   ./deploy.sh V1.5.12 "Описание изменений"
#
# Что делает:
#   1. Обновляет /var/www/amoschool/VERSION
#   2. Собирает фронтенд (npm run build)
#   3. Перезапускает бэкенд (pm2 restart 7)
#   4. git add . && git commit && git push
# =============================================================

set -e

VERSION="$1"
DESCRIPTION="$2"
DATE=$(date +%Y-%m-%d)
PROJECT_DIR="/var/www/amoschool"
FRONTEND_DIR="$PROJECT_DIR/frontend"

if [ -z "$VERSION" ] || [ -z "$DESCRIPTION" ]; then
  echo "Использование: ./deploy.sh <VERSION> \"<описание>\""
  echo "Пример:        ./deploy.sh V1.5.12 \"Fix migration date prefix\""
  exit 1
fi

echo ""
echo "========================================"
echo " Деплой $VERSION"
echo " $DESCRIPTION"
echo " Дата: $DATE"
echo "========================================"

# 1. Обновить VERSION файл
echo "$VERSION" > "$PROJECT_DIR/VERSION"
echo "✅ VERSION обновлён: $VERSION"

# 2. Собрать фронтенд
echo ""
echo "🔨 Сборка фронтенда..."
cd "$FRONTEND_DIR"
npm run build
echo "✅ Фронтенд собран"

# 3. Перезапустить бэкенд
echo ""
echo "🔄 Перезапуск PM2 (id=8)..."
pm2 restart 7 --update-env
echo "✅ Бэкенд перезапущен"

# 4. Git commit + push
echo ""
echo "📦 Git commit..."
cd "$PROJECT_DIR"
git add -A
git commit -m "$VERSION - $DESCRIPTION - $DATE"
git push
echo "✅ Запушено в git"

echo ""
echo "========================================"
echo " Деплой завершён: $VERSION"
echo "========================================"
