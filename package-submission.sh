#!/usr/bin/env bash
# اسکریپت فشرده‌سازی و بسته‌بندی برای تحویل در کوئرا
set -e

STDID="${1:-STUDENT_ID}"
ZIP_NAME="WP-HW1-${STDID}.zip"

echo "در حال بسته‌بندی فایل‌های پروژه با نام: ${ZIP_NAME} ..."
cd "$(dirname "$0")"

zip -r "./${ZIP_NAME}" \
  index.html \
  README.md \
  گزارش.pdf \
  css/ \
  js/ \
  assets/ \
  -x "*.DS_Store" "*__MACOSX*"

echo "فایل فشرده نهایی با موفقیت ایجاد شد: ./${ZIP_NAME}"
