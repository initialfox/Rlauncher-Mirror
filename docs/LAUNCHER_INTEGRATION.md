# Зеркала CDN и интеграция с лаунчером

## Зачем отдельное зеркало

| Сервер | Репозиторий | Что делает |
|--------|-------------|------------|
| **Основной API** | [Rlauncher-Backend](https://github.com/initialfox/Rlauncher-Backend) | Auth, профиль, список серверов, admin, Telegram, authlib |
| **Зеркало CDN** | [Rlauncher-Mirror](https://github.com/initialfox/Rlauncher-Mirror) | Только тяжёлые файлы: client **v2**, ZIP лаунчера |
| **Лаунчер (UI)** | [MineHubLauncher](https://github.com/initialfox/MineHubLauncher) | Electron + React |

Зеркало не тянет PostgreSQL и весь бэкенд — на EU/VPS клонируешь только **Rlauncher-Mirror** + папку `uploads/`.

```
┌─────────────┐     auth, /api/servers, news      ┌──────────────────┐
│  Лаунчер    │ ───────────────────────────────► │ launch3 (primary) │
└─────────────┘                                    └──────────────────┘
       │
       │  v2 manifest, update-stream, loader zip
       ▼
┌──────────────────┐
│ alternate (mirror)│  ← Rlauncher-Mirror
└──────────────────┘
```

---

## 1. Деплой зеркала

```bash
git clone https://github.com/initialfox/Rlauncher-Mirror.git
cd Rlauncher-Mirror
npm install
cp .env.example .env
cp data/mirror-servers.example.json data/mirror-servers.json
```

### Файлы на диске

Скопировать с основного сервера (rsync / SFTP):

```
uploads/
  clients/instances/<dir>/...
  clients/versions/<version>/...
  loader/<arch>/RLauncher.zip
```

### Список модпаков

На **основном** бэкенде:

```bash
npm run export-mirror-servers
# скопировать data/mirror-servers.json на зеркало
```

### Запуск

```bash
node server.js --port 8888 --domain alternate.lastdawn.ru
```

| Параметр | Назначение |
|----------|------------|
| `--port` | Только порт процесса Node (за nginx — 8888, снаружи 443) |
| `--domain` | Публичный URL в `check-update` и ссылках на loader (`https://` добавится сам) |

Проверка: `GET https://alternate.lastdawn.ru/health`

### Подпись манифестов (опционально)

- `CLIENT_UPDATE_PRIVATE_KEY` в `.env` — тот же PEM, что на основном API, **или пусто**
- Если пусто: `signature: null`, лаунчер принимает holder при пустом `CLIENT_UPDATE_V2_PUBLIC_KEY_PEM` в `appConfig.js` (как сейчас)

### Версия лаунчера на зеркале

В `.env` зеркала:

```env
LAUNCHER_LATEST_VERSION=2.0.90
```

Должна совпадать с тем, что выкладываете в `uploads/loader/<arch>/RLauncher.zip`.

---

## 2. Как лаунчер выбирает сервер

В `src/config/appConfig.js` два URL на режим:

| Поле | Используется для |
|------|------------------|
| `apiBaseUrl` | Логин, `/api/servers`, новости, скины, `check-update` в UI |
| `clientApiBaseUrl` | Client v2: манифест, `update-stream`, authlib jar URL |

Режим хранится в `localStorage` (`rlauncher-mode`: `primary` | `secondary`).

Loader (установщик до первого запуска) читает отдельные константы в `loader/electron/main.js` и передаёт в лаунчер `--launcher-server-mode=primary|secondary`.

---

## 3. Настройка лаунчера под зеркало

### Вариант A — «Европа»: всё тяжёлое с зеркала, auth с основного (рекомендуется)

`src/config/appConfig.js`:

```javascript
export const LAUNCHER_MODES = {
  primary: {
    id: 'primary',
    label: 'Россия',
    apiBaseUrl: 'https://launch3.lastdawn.ru',
    clientApiBaseUrl: 'https://launch3.lastdawn.ru',
    authlibTextureDomainWhitelist: 'launch3.lastdawn.ru'
  },
  secondary: {
    id: 'secondary',
    label: 'Европа',
    apiBaseUrl: 'https://launch3.lastdawn.ru',           // auth и список серверов
    clientApiBaseUrl: 'https://alternate.lastdawn.ru', // скачивание клиента v2
    authlibTextureDomainWhitelist: 'launch3.lastdawn.ru'
  }
};
```

**Что работает:** скачивание модпаков (v2), authlib с основного домена.

**Нюанс:** диалог «обновить лаунчер» внутри UI ходит на `apiBaseUrl` → `check-update` на **launch3**, не на зеркало. ZIP лаунчера для EU лучше качать через **Loader** (см. ниже) или позже переключить `checkUpdate` на `clientApiBaseUrl`.

### Вариант B — зеркало как полный «второй хост» (как старый IP)

Оба URL на зеркало:

```javascript
secondary: {
  apiBaseUrl: 'https://alternate.lastdawn.ru',
  clientApiBaseUrl: 'https://alternate.lastdawn.ru',
  authlibTextureDomainWhitelist: 'alternate.lastdawn.ru'
}
```

Подходит, если на зеркале не нужен логин из лаунчера к API (только раздача файлов). Иначе auth на зеркале **не работает** — там нет `/api/auth`.

### Loader (первичная установка / обновление лаунчера)

`loader/electron/main.js`:

```javascript
const SECONDARY_API_BASE_URL = 'https://alternate.lastdawn.ru';
const FORCE_SECONDARY_REGION = true;  // всегда EU, или false — fallback если primary недоступен
```

Loader дергает `GET {apiBaseUrl}/api/client/check-update` и качает `downloadUrl` с зеркала.

После установки передаётся `--launcher-server-mode=secondary` → лаунчер подхватывает `LAUNCHER_MODES.secondary`.

---

## 4. Что куда ходит в коде

| Действие | URL в коде |
|----------|------------|
| Скачивание клиента v2 (manifest + stream) | `getClientApiBaseUrl()` → `clientUpdateV2.js` |
| Authlib injector | `getClientApiBaseUrl()` |
| Логин, серверы, новости | `getApiBaseUrl()` → `fetchAPI` |
| `check-update` в UI | `getApiBaseUrl()` → `api.js` `checkUpdate` |
| Баннеры при режиме EU | `loaderReserveServer=1` на `/api/servers` (основной API переписывает URL баннеров) |

При **варианте A** для обновления лаунчера в EU настрой Loader на зеркало или добавь в `api.js`:

```javascript
// check-update — с CDN, как клиент
const base = getClientApiBaseUrl();
const url = `${base}/api/client/check-update?...`;
```

---

## 5. Подпись v2

| Сторона | Переменная / константа |
|---------|-------------------------|
| Зеркало / бэкенд | `CLIENT_UPDATE_PRIVATE_KEY` (PEM) |
| Лаунчер | `CLIENT_UPDATE_V2_PUBLIC_KEY_PEM` в `appConfig.js` |

Оба пустые → манифесты без проверки подписи (режим отладки / внутренняя сеть).

---

## 6. Nginx (пример)

Node слушает `8888`, снаружи `https://alternate.lastdawn.ru`:

```nginx
server {
  listen 443 ssl;
  server_name alternate.lastdawn.ru;

  location / {
    proxy_pass http://127.0.0.1:8888;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    client_max_body_size 50m;
  }
}
```

Запуск: `node server.js --port 8888 --domain https://alternate.lastdawn.ru`

---

## 7. Чеклист после деплоя

1. `curl https://alternate.lastdawn.ru/health`
2. `curl 'https://alternate.lastdawn.ru/api/client/v2/update-list'`
3. В лаунчере: режим «Европа» → скачать модпак → в Network только `alternate.lastdawn.ru` для v2
4. Loader: `check-update` → `downloadUrl` с доменом зеркала
5. После заливки новых файлов в `uploads/clients` — перезапуск зеркала (прогрев кэша)

---

## 8. Синхронизация контента

Зеркало **не** подтягивает файлы само. Обновление:

1. Залить `uploads/` на зеркало (rsync).
2. Обновить `data/mirror-servers.json` при новых модпаках.
3. Перезапустить `node server.js ...`.

Основной API и зеркало должны иметь **одинаковые** `dir` / `version` в JSON и на диске.
