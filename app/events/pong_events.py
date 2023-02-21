from .base_events import NamespaceBase
from flask_socketio import join_room, emit, send
from flask import session, request
from ..models import Room
from .. import app
from redis_om import NotFoundError
from datetime import datetime
from tasks import game, celery
import json
from enum import Enum
from celery.result import AsyncResult
from ..helper_functions import terminate_room


class PongNamespace(NamespaceBase):
    def on_connect(self):
        if 'room_id' not in session:
            return False

        room_id = session['room_id']
        join_room(room_id)

        try:
            room = Room.get(room_id)

            if request.sid not in room.connections:
                room.connections.append(request.sid)
                room.save()
            
            key_prefix = ':{}:'.format(Room.Meta.model_key_prefix)

            if 'user_id' not in session or 'username' not in session:
                data = {
                    'room_id': room_id,
                    'timeout': Room.db().ttl('{}{}'.format(key_prefix, room_id)) - app.config['TTT_ROOM_TIME_DELTA'],
                    'is_game_started': room.is_game_started
                }
                emit('setup', data, room=request.sid)
                return

            user_id = session['user_id']
            username = session['username']

            data = {
                'user_id': user_id,
                'username': username,
                'room_id': room_id,
                'timeout': Room.db().ttl('{}{}'.format(key_prefix, room_id)),
                'is_game_started': room.is_game_started,
                'has_second_player_joined': room.user2_id != '',
                'player_is_ready': (True if (user_id == room.user1_id and room.is_user1_ready) or (user_id == room.user2_id and room.is_user2_ready) else False),
                'is_second_player': (user_id == room.user2_id)
            }

            def setup_callback(data):
                if data:
                    if 'has_joined' not in session:
                        if room.user2_id == user_id:
                            emit('update', {'timeout': Room.db().ttl('{}{}'.format(key_prefix, room_id)) - app.config['TTT_ROOM_TIME_DELTA']}, room=room_id)
                        
                        send(['', '', '{} has entered the room.'.format(username), datetime.now().strftime('%H:%M:%S')], room=room_id)

                        session['has_joined'] = True

            emit('setup', data, room=request.sid, callback=setup_callback)
        except NotFoundError:
            emit('refresh', room=room_id)

    def on_start(self):
        if 'room_id' in session and 'user_id' in session and 'user_started' not in session:
            room_id = session['room_id']
            user_id = session['user_id']

            try:
                room = Room.get(room_id)

                if not room.is_game_started:
                    if not (room.is_user1_ready and room.is_user2_ready):
                        if room.user1_id == user_id:
                            room.is_user1_ready = True
                        elif room.user2_id == user_id:
                            room.is_user2_ready = True

                        session['user_started'] = True
                        # Race condition problem when two clients click "Start" button in the same time...
                        # Needs synchronization solution e.g. Redis Distributed Locks
                        room.save()

                    if room.is_user1_ready and room.is_user2_ready:
                        room.is_game_started = True
                        room.save()
                        timeout = app.config['OG_PONG_ROOM_TIMEOUT']
                        
                        result = game.apply_async(args=(room_id, { 'player1' : { 'id' : room.user1_id, 'nick' : room.user1_name }, 'player2' : { 'id' : room.user2_id, 'nick' : room.user2_name } }, app.config['BEST_OF_COUNTER'], f':{Room.Meta.model_key_prefix}:'), time_limit=timeout)
                        task_id = result.id
                        room.game.task_id = task_id
                        room.save()

                        room.expire(timeout)
                        emit('update_time', { 'timeout': timeout }, room=room_id)
            except NotFoundError:
                emit('refresh', room=room_id)

    class PubSubMessageType(Enum):
        STATUS = 0x0
        SYNC = 0x1

    def on_player_status(self, data):
        if 'user_id' in session:
            user_id = session['user_id']

            conn = Room.db()
            conn.publish(session['room_id'], json.dumps((self.PubSubMessageType.STATUS.value, user_id, data['command'], data['user_tick'])))
    
    def on_sync(self):
        conn = Room.db()
        conn.publish(session['room_id'], json.dumps((self.PubSubMessageType.SYNC.value, request.sid)))
    
    def on_termination(self):
        if 'room_id' not in session or 'user_id' not in session or 'username' not in session:
            session.clear()
            return

        room_id = session['room_id']
        user_id = session['user_id']
        username = session['username']

        try:
            room = Room.get(room_id)
            task_id = room.game.task_id
            if task_id != '':
                task = AsyncResult(room.game.task_id, app=celery)
                task.revoke(terminate=True)
        except NotFoundError:
            pass

        send(['', '', '{} has exited the room.'.format(username), datetime.now().strftime('%H:%M:%S')], room=room_id)
        emit('terminate_client', {'user_id': user_id}, room=room_id)