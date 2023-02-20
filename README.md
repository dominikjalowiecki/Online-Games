[![Preview project](https://img.shields.io/static/v1?label=Flask&message=Preview&color=success&style=flat&logo=Flask)][preview]

# Online-Games

Web application with online games for two players. [Click here to preview.][preview]

[preview]: https://djalowiecki.toadres.pl/online-games

### Table of content

- [Technologies](#technologies)
- [Features](#features)
- [Setup](#setup)

---

### Technologies

- Flask
- PyGame
- Phaser
- Bootstrap
- Socket.IO
- JQuery
- Celery
- Redis
  - RedisJSON
  - RediSearch
  - Redis Pub/Sub
- Redis-OM
- Docker

---

### Features

- [x] Turn-based game - Tic Tac Toe
- [x] Fast-paced game - Pong
  - [x] Client-side prediction
  - [x] Server state reconciliation
  - [x] Linear move interpolation
- [x] Creating new room
- [x] Room chat
- [x] Spectating room
- [x] Searching for rooms
- [x] Paggination

Default config for Pong: 40 ticks server / 15 ticks client input

---

### Setup

#### Clone repository

```bash
git clone https://github.com/dominikjalowiecki/Online-Games.git
```

#### Change directory

```bash
cd ./Online-Games
```

#### Setup virtual environment

```bash
python -m venv venv
source ./venv/bin/activate
pip install --no-cache-dir -r requirements.txt
```

#### Setup .env file

```
FLASK_APP=app
FLASK_DEBUG=True

SECRET_KEY=secret_phrase
SERVER_PORT=5000

SESSION_REDIS=<redis-url>
SOCKETIO_REDIS_CHANNEL='online-games-socketio'
REDIS_MESSAGE_QUEUE_URL=<redis-url>
REDIS_OM_URL=<redis-url>

LOG_FILE=logs/record.log
```

#### Setup tasks/.env file

```
REDIS_CELERY_URL=<redis-url>
SOCKETIO_REDIS_CHANNEL='online-games-socketio'
REDIS_MESSAGE_QUEUE_URL=<redis-url>
```

#### Change directory

```bash
cd ./js
```

#### Install dependencies and build static files

```bash
npm ci && npm run build
```

#### (Optional step) If used in production mode, you should compress static files manually

```bash
cd ..
python -m whitenoise.compress ./app/static
```

#### On first terminal run celery worker

##### Remember to activate virtual environment!

```bash
celery -A tasks worker --autoscale=10,0 --loglevel=INFO
```

#### On second terminal start server

##### Remember to activate virtual environment!

```bash
python online-games.py
```

### OR

#### Run docker-compose "production" environment

```bash
docker compose up -d
```

Application available on http://localhost:5000.

---

### Projects hosting infrastructure

![Projects hosting infrastructure](/images/vps_infrastructure.drawio.png)
