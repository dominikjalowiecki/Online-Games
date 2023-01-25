import redis
from math import ceil
from datetime import timedelta
from decouple import config
import os

class Config():
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

    SECRET_KEY = config('SECRET_KEY') # 'import secrets; print(secrets.token_hex())'

    SESSION_TYPE = 'redis'
    SESSION_REDIS = redis.from_url(config('SESSION_REDIS'))
    SESSION_KEY_PREFIX = 'flask-session:'
    SESSION_USE_SIGNER = True
    SESSION_PERNAMENT = True
    PERMANENT_SESSION_LIFETIME = timedelta(days=30)

    PAGE_SIZE = 9

    BEST_OF_SYSTEM = 5
    BEST_OF_COUNTER = ceil(BEST_OF_SYSTEM/2)

    TTT_NEW_ROOM_TIMEOUT = 300
    TTT_START_GAME_TIMEOUT = 60
    TTT_MOVE_TIMEOUT = 20
    TTT_ROOM_TIME_DELTA = 5
    TTT_ROOM_MOVE_TIMEOUT = TTT_MOVE_TIMEOUT + TTT_ROOM_TIME_DELTA

    OG_PONG_ROOM_TIMEOUT = 300

    MAX_PONG_GAMES = 3
    MAX_TTT_GAMES = 3

    LOG_FILE = os.path.join(BASE_DIR, config('LOG_FILE'))

    SOCKETIO_REDIS_CHANNEL = config('SOCKETIO_REDIS_CHANNEL')
    REDIS_MESSAGE_QUEUE_URL = config('REDIS_MESSAGE_QUEUE_URL')
  