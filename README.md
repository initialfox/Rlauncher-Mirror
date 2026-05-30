# Rlauncher Mirror

Лёгкое CDN-зеркало: client **v2** + обновление лаунчера. Без PostgreSQL, auth и Telegram.

Полный API — в [Rlauncher-Backend](https://github.com/initialfox/Rlauncher-Backend).

**Как подключить лаунчер к зеркалу:** [docs/LAUNCHER_INTEGRATION.md](docs/LAUNCHER_INTEGRATION.md)

## Быстрый старт

```bash
git clone https://github.com/initialfox/Rlauncher-Mirror.git
cd Rlauncher-Mirror
npm install
cp .env.example .env
cp data/mirror-servers.example.json data/mirror-servers.json
# положить uploads/ (clients + loader) как на основном сервере
# CLIENT_UPDATE_PRIVATE_KEY в .env — опционально (можно пусто, если в лаунчере нет публичного ключа)

node server.js --port 8888 --domain alternate.lastdawn.ru
```

- **`--port`** — только порт процесса (listen)
- **`--domain`** — публичный URL для ссылок (`https://` добавится сам, если не указан)

## Структура uploads

```
uploads/
  clients/instances/<dir>/...
  clients/versions/<version>/...
  loader/<arch>/RLauncher.zip
```

## Список модпаков

`data/mirror-servers.json` — экспорт с основного бэкенда:

```bash
# на Rlauncher-Backend
npm run export-mirror-servers
```

## API

| Метод | Путь |
|-------|------|
| GET | `/api/client/v2/update-list` |
| GET | `/api/client/v2/profiles` |
| GET | `/api/client/v2/server/:id/manifest?arch=...` |
| POST | `/api/client/v2/server/:id/update-stream?arch=...` |
| GET | `/api/client/check-update` |
| GET | `/api/client/loader/download/:arch` |
| GET | `/health` |
