from app import app, socketio
from dotenv import load_dotenv
from decouple import config

if __name__ == '__main__':
    load_dotenv()
    socketio.run(app, debug=config('FLASK_DEBUG', cast=bool, default=False), host=config('HOST', default='127.0.0.1'), port=config('SERVER_PORT', cast=int, default=5000))

# python online-games.py
# celery -A tasks worker --autoscale=10,0 --loglevel=INFO