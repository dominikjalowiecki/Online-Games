import eventlet
eventlet.monkey_patch()

from flask import Flask
from config import Config
from flask_socketio import SocketIO
from flask_session import Session
from whitenoise import WhiteNoise
from flask_talisman import Talisman
import logging
import os

from werkzeug.middleware.proxy_fix import ProxyFix

app = Flask(__name__)
app.config.from_object(Config)

if(app.config['DEBUG'] == False):
    logging.basicConfig(filename=app.config['LOG_FILE'], filemode='a', format=f'%(asctime)s - %(levelname)s -  %(name)s %(threadName)s :: %(message)s', datefmt='%H:%M:%S', level=logging.WARNING)

    app.wsgi_app = WhiteNoise(app.wsgi_app, root=os.path.join(app.config['BASE_DIR'], 'app/static'), prefix='static/')
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)
    csp = {
        'default-src': '\'self\'',
        'img-src': ('\'self\'', 'data:', 'blob:')
    }
    Talisman(app, force_https=False, content_security_policy=csp)

socketio = SocketIO(app, logger=app.config['DEBUG'], engineio_logger=app.config['DEBUG'], manage_session=False, message_queue=app.config['REDIS_MESSAGE_QUEUE_URL'], channel=app.config['SOCKETIO_REDIS_CHANNEL'], async_mode='eventlet', ping_interval=30)
Session(app)

from . import routes, request_functions, errors, events