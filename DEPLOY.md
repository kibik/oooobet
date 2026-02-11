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

`DATABASE_URL` подтягивается из PostgreSQL-сервиса (Reference).

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

Миграции при деплое применяются автоматически (`prisma migrate deploy` в `npm run build`).
