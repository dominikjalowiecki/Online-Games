from .. import socketio
from .tictactoe_events import TicTacToeNamespace
from .pong_events import PongNamespace

socketio.on_namespace(TicTacToeNamespace('/tic-tac-toe'))
socketio.on_namespace(PongNamespace('/pong'))