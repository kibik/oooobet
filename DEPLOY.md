# Деплой на Railway

## 0. Если Railway пишет «Connected branch does not exist»

В GitHub ещё нет ветки `main`. Сделай так:

1. **Создай репозиторий на GitHub:** [github.com/new](https://github.com/new), имя например `ooobed`, **не** ставь галочку «Add a README» — репо должен быть пустым.
2. **Подключи remote и запушь** (подставь свой логин и имя репо):

```bash
cd /Users/antonspiridonov/Documents/cursor/ooobed
git remote add origin https://github.com/ТВОЙ_ЛОГИН/ooobed.git
git push -u origin main
```

3. В Railway обнови страницу или нажми **Redeploy** — ветка `main` появится.

---

## 1. Репозиторий

Закоммить проект и создать репозиторий на GitHub, затем подключить его к Railway (см. блок выше).

## 2. Новый проект в Railway

1. [railway.app](https://railway.app) → **New Project**
2. **Deploy from GitHub repo** → выбери репозиторий `ooobed`
3. **Add PostgreSQL** (в том же проекте: New → Database → PostgreSQL)
4. Railway подхватит `DATABASE_URL` из сервиса БД и подставит в приложение автоматически (Variables → Reference from PostgreSQL).

## 3. Переменные окружения

В настройках сервиса приложения (не БД) добавь:

| Переменная | Описание |
|------------|----------|
| `NEXT_PUBLIC_BASE_URL` | **После первого деплоя** — URL приложения (например `https://ooobed-production-xxxx.up.railway.app`). Взять в Settings → Domains. |
| `TELEGRAM_BOT_TOKEN` | Токен от @BotFather |
| `NEXT_PUBLIC_BOT_USERNAME` | Юзернейм бота без `@` (например `ooobet_bot`) |
| `SESSION_SECRET` | Случайная строка ≥ 32 символов. Сгенерировать: `openssl rand -base64 32` |

`DATABASE_URL` можно взять из PostgreSQL-сервиса (Reference). **Если при деплое ошибка «Can't reach database server at postgres.railway.internal»** — см. раздел 9 ниже: используй публичный URL БД.

## 4. Домен и BASE_URL

1. В сервисе приложения: **Settings → Networking → Generate Domain**
2. Скопируй URL (например `https://ooobed-production-xxxx.up.railway.app`)
3. В переменных добавь/измени `NEXT_PUBLIC_BASE_URL` на этот URL
4. Сделай **Redeploy**, чтобы новый `NEXT_PUBLIC_BASE_URL` попал в сборку

## 5. Webhook Telegram

После того как приложение задеплоилось и `NEXT_PUBLIC_BASE_URL` указывает на Railway, один раз вызови:

```bash
curl "https://ТВОЙ_РАЙЛВЕЙ_URL/api/bot/setup?secret=ТВОЙ_TELEGRAM_BOT_TOKEN"
```

Либо открой в браузере (подставь свой URL и токен):

```
https://ТВОЙ_РАЙЛВЕЙ_URL/api/bot/setup?secret=ТВОЙ_TELEGRAM_BOT_TOKEN
```

В ответе должно быть `"ok": true` и адрес webhook.

## 6. BotFather

В @BotFather для бота:

- **Bot Settings → Allow Groups** — включено, если бот будет в группах
- Домен для виджета авторизации не нужен при входе через бота (кнопка «Войти через Telegram» открывает `t.me/bot?start=auth_...`)

## 7. Локальная разработка

Для разработки нужен PostgreSQL:

- Локально: установи Postgres и создай базу, в `.env` укажи `DATABASE_URL=postgresql://...`
- Либо создай в Railway отдельный dev-проект с PostgreSQL и подставь его `DATABASE_URL` в локальный `.env`

**Если подключаешься к БД на Railway с ноутбука:** в `.env` обязательно используй **публичный** URL. В Railway у PostgreSQL есть два URL:
- **Public** — хост вида `roundhouse.proxy.rlwy.net` (или другой) — подходит для локального запуска.
- **Private** — хост `postgres.railway.internal` — работает **только** между сервисами внутри одного проекта на Railway.

Если в `DATABASE_URL` указан `postgres.railway.internal`, с локальной машины будет ошибка: *"Can't reach database server at postgres.railway.internal:5432"*. Скопируй из Railway переменную **Public** URL (в карточке PostgreSQL → Variables / Connect → Connection URL с публичным хостом).

Миграции при деплое применяются автоматически (`prisma migrate deploy` в `npm run start`).

---

## 8. Ошибки входа через бота

- **500 на сайте при нажатии «Войти через Telegram»** (запрос к `/api/auth/token`) или **бот отвечает «Что-то пошло не так. Попробуй ещё раз.»** после перехода по ссылке из кнопки — обычно одна и та же причина: БД или миграции.

Что проверить:

1. **Railway → сервис приложения → Variables:** есть `DATABASE_URL`. Если приложение и PostgreSQL в **одном проекте** Railway, можно использовать переменную из PostgreSQL (Reference) — для сервисов внутри проекта подойдёт и internal URL. Если ошибка *"Can't reach database server at postgres.railway.internal:5432"* на **деплое** (не локально): проверь, что БД в том же проекте, не приостановлена, и при необходимости переподключи ссылку на переменные PostgreSQL.
2. **Railway → Deployments:** последний деплой успешен; при старте выполняется `prisma migrate deploy` — таблицы `User` и `AuthToken` должны быть созданы.
3. **Логи (View Logs):** при нажатии «Войти через Telegram» ищи строку `Create auth token error:`; при ответе бота «Что-то пошло не так» — `Auth token confirmation error:`. По тексту ошибки (и коду Prisma, если есть) можно понять: нет таблицы, нет подключения к БД и т.д.
4. После изменений в `prisma/schema.prisma` или миграциях сделай коммит и пуш — Railway пересоберёт приложение и при старте применит миграции.

---

## 9. Ошибка «Can't reach database server» (P1001) на деплое

Если при старте видно `P1001` и хост `postgres.railway.internal` или `*.proxy.rlwy.net`, приложение не достучалось до БД.

**Чеклист в Railway:**

1. **PostgreSQL и приложение в одном проекте** — иначе внутренняя сеть недоступна.
2. **PostgreSQL не приостановлен** — в карточке БД статус должен быть Running.
3. **TCP Proxy для публичного доступа** — сервис PostgreSQL → Settings → Networking → **Generate TCP Proxy** (если используешь public URL). Без прокси public-хост может не отвечать.
4. **Переменная `RAILWAY_BETA_ENABLE_BUILD_V2=1`** — в сервисе приложения добавь эту переменную. Иногда улучшает работу внутренней сети.
5. **Попробуй internal URL** — в приложении используй Reference на `DATABASE_URL` из PostgreSQL (внутренний хост). Для app-to-DB внутри проекта internal обычно надёжнее public.
6. **Стартовая задержка** — скрипт `scripts/start-with-migrate.js` ждёт 20 с перед первой попыткой миграции (контейнеры стартуют параллельно). Затем 5 попыток с паузой 10 с.

**Если всё равно не работает:** добавь в приложении переменную `RAILWAY_SKIP_MIGRATE_ON_FAIL=1` — при неудачной миграции приложение всё равно запустится (запросы к БД будут падать, но можно отладить).
