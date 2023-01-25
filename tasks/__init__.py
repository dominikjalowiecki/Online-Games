from celery import Celery
from .pong import Game
from dotenv import load_dotenv
import os

load_dotenv()

redis_url = os.environ['REDIS_CELERY_URL']
celery = Celery('tasks', backend=redis_url, broker=redis_url)

@celery.task(bind=True, ignore_result=True, name='game-task')
def game(self, game_id, players, bo_counter, model_prefix):
    game = Game(self, game_id, players, bo_counter, model_prefix)
    return game.on_execute()