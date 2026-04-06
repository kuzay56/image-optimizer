# public-image-optimizer

Available on npm: https://www.npmjs.com/package/public-image-optimizer

Install: `npm install --save-dev public-image-optimizer`

A small CLI for optimizing images in a project's `public/` directory. It shrinks original `.png`, `.jpg`, and `.jpeg` files when that actually makes them smaller, generates adjacent `.webp` and `.avif` files, and keeps a cache so the same images are not processed over and over again.

It is especially useful for CDN and static delivery setups where you want to prepare `png/jpeg + webp + avif` in advance and then let your CDN, edge logic, or frontend choose what to serve.

---

## English

I made this for projects where a lot of images live in `public/` and you want one simple command you can run before commits, builds, or content updates.

This package does not do runtime format negotiation by itself. Its job is to prebuild and cache optimized image variants so your delivery layer can decide between the original file, WebP, and AVIF.

What it does:

- optimizes original `.png`, `.jpg`, and `.jpeg` files only when the result is smaller
- creates `.webp` and `.avif` next to PNG/JPEG sources
- reuses results for identical files through hash-based cache
- supports `--changed` so you can process only files changed in git
- cleans up derived files when source files are renamed or removed
- supports `--dry-run` and `--verbose` when you want to check changes before writing anything

Install it in a project:

- npm: `npm install --save-dev public-image-optimizer`
- yarn: `yarn add -D public-image-optimizer`
- pnpm: `pnpm add -D public-image-optimizer`

Run it from the root of the project that contains `public/`.

- full run: `public-image-optimizer`
- only changed files: `public-image-optimizer --changed`
- check without writing files: `public-image-optimizer --dry-run --verbose`

If you want to add it to `package.json`, these scripts are usually enough:

- `"images:optimize": "public-image-optimizer"`
- `"images:optimize:changed": "public-image-optimizer --changed"`
- `"images:optimize:check": "public-image-optimizer --dry-run --verbose"`

CLI options:

- `--changed` process only changed files in `public/` using git
- `--dry-run` show what would change without writing files
- `--verbose` print detailed stats
- `--concurrency=<n>` set worker count from `1` to `8`, default is `3`
- `--help` show CLI help

About cache and git:

The cache is stored in `.cache/public-image-optimizer-cache.json`. That cache is created in the consumer project, not in this repository.

If you want the cache to stay local, add `.cache/` or `.cache/public-image-optimizer-cache.json` to the consumer project's `.gitignore`.

If your team wants to share that cache between developers or CI runs, you can keep the cache file in git.

A couple of practical notes:

- Node.js `18+` is expected
- `git` is optional, but `--changed` makes the most sense inside a git repo
- existing `.webp` and `.avif` files are not re-encoded by default
- if git metadata is unavailable, `--changed` falls back to a full scan

---

## Русский

Я делал этот пакет для проектов, где в `public/` лежит много картинок и нужен один нормальный скрипт, который можно гонять перед коммитами, билдом или после очередной загрузки изображений.

По сути он особенно полезен для CDN и похожих сценариев доставки статики: ты заранее готовишь оптимизированные `png/jpeg + webp + avif`, а дальше CDN, edge-логика или сам фронт уже решают, что именно отдавать пользователю.

Сам пакет не занимается выбором формата на лету. Его задача в другом: заранее собрать и закешировать оптимизированные варианты, чтобы потом можно было выбрать между оригиналом, WebP и AVIF.

Что он делает:

- оптимизирует исходные `.png`, `.jpg` и `.jpeg`, но только если результат реально меньше
- создаёт рядом `.webp` и `.avif` для PNG/JPEG-источников
- переиспользует результаты через кеш по хешам файлов
- поддерживает `--changed`, чтобы обрабатывать только изменённые файлы через git
- чистит производные файлы, если исходники были переименованы или удалены
- умеет работать в `--dry-run` и `--verbose`, если сначала хочешь просто посмотреть, что он сделает

Установка в проект:

- npm: `npm install --save-dev public-image-optimizer`
- yarn: `yarn add -D public-image-optimizer`
- pnpm: `pnpm add -D public-image-optimizer`

Запускать его нужно из корня проекта, где лежит `public/`.

- полный запуск: `public-image-optimizer`
- только изменённые файлы: `public-image-optimizer --changed`
- проверка без записи файлов: `public-image-optimizer --dry-run --verbose`

Если хочешь добавить его в `package.json`, обычно хватает таких скриптов:

- `"images:optimize": "public-image-optimizer"`
- `"images:optimize:changed": "public-image-optimizer --changed"`
- `"images:optimize:check": "public-image-optimizer --dry-run --verbose"`

Опции CLI:

- `--changed` обрабатывать только изменённые файлы в `public/` через git
- `--dry-run` показать, что изменилось бы, без записи файлов
- `--verbose` вывести подробную статистику
- `--concurrency=<n>` задать число воркеров от `1` до `8`, по умолчанию `3`
- `--help` показать справку

Про кеш и git:

Кеш хранится в `.cache/public-image-optimizer-cache.json`. Он создаётся в том проекте, где ты запускаешь CLI, а не в репозитории самой утилиты.

Если кеш не должен попадать в git фронтового проекта, добавь в `.gitignore` проекта `.cache/` или `.cache/public-image-optimizer-cache.json`.

Если хочешь шарить этот кеш между разработчиками или использовать его в CI, файл можно хранить в репозитории проекта.

Что ещё важно:

- нужен Node.js `18+`
- `git` не обязателен, но для `--changed` он, очевидно, нужен
- существующие `.webp` и `.avif` по умолчанию не переоптимизируются
- если git-данные недоступны, режим `--changed` сам переключится на полный проход
