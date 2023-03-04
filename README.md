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

#### Initialize environment

```bash
make
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

#### (Optional step) If used in production mode, you should compress static files manually

```bash
python -m whitenoise.compress ./app/static
```

#### Run development environment

```bash
make run
```

##### Use `make clean` to delete development environment.

### OR

#### Run "production" environment

```bash
make start
```

##### Use `make stop` to stop docker-compose services.

Application available on http://localhost:5000

---

### Projects hosting infrastructure

![Projects hosting infrastructure](/images/vps_infrastructure.drawio.png)
