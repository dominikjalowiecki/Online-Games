from .base_events import NamespaceBase
from flask import session, request
from flask_socketio import join_room, emit, send
from socketio.exceptions import TimeoutError
from ..models import Room
from .. import app
from datetime import datetime
from redis_om import NotFoundError
import random
from ..helper_functions import terminate_room
from .helper_functions import (
    check_matrix,
    get_empty_matrix,
    clear_matrix,
    check_if_matrix_is_full
)

class TicTacToeNamespace(NamespaceBase):
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
            player_turn = (room.user2_id, room.user2_name) if room.game.player_turn_id == room.user2_id else ((room.user1_id, room.user1_name) if room.game.player_turn_id == room.user1_id else ('', ''))

            if 'user_id' not in session or 'username' not in session:
                data = {
                    'room_id': room_id,
                    'timeout': Room.db().ttl('{}{}'.format(key_prefix, room_id)) - app.config['TTT_ROOM_TIME_DELTA'],
                    'is_game_started': room.is_game_started,
                    'player_turn_username': player_turn[1]
                }
                emit('setup', data, room=request.sid)
                return

            user_id = session['user_id']
            username = session['username']

            data = {
                'user_id': user_id,
                'username': username,
                'room_id': room_id,
                'timeout': Room.db().ttl('{}{}'.format(key_prefix, room_id)) - app.config['TTT_ROOM_TIME_DELTA'],
                'is_game_started': room.is_game_started,
                'player_turn_id': player_turn[0],
                'player_turn_username': player_turn[1],
                'matrix': room.game.matrix,
                'has_second_player_joined': room.user2_id != '',
                'player_is_ready': (True if (user_id == room.user1_id and room.is_user1_ready) or (user_id == room.user2_id and room.is_user2_ready) else False)
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
                        players = (
                            (room.user1_id, room.user1_name),
                            (room.user2_id, room.user2_name)
                        )

                        signs = ['X', 'O']
                        random.shuffle(signs)

                        room.game.player1_sign = signs[0]
                        room.game.player2_sign = signs[1]
                        room.is_game_started = True
                        
                        starting_player = random.choice(players)
                        room.game.player_turn_id = starting_player[0]
                        room.save()
                        room.expire(app.config['TTT_ROOM_MOVE_TIMEOUT'])

                        data = {
                            'player_turn_id': starting_player[0],
                            'player_turn_username': starting_player[1],
                            'timeout': app.config['TTT_MOVE_TIMEOUT'],
                            'matrix': room.game.matrix
                        }

                        send(['', '', '{} turn.'.format(starting_player[1]), datetime.now().strftime('%H:%M:%S')], room=room_id)
                        emit('update_game', data, room=room_id)
            except NotFoundError:
                emit('refresh', room=room_id)
    
    def on_update_game(self):
        if 'room_id' in session and 'user_id' in session:
            room_id = session['room_id']
            user_id = session['user_id']

            try:
                room = Room.get(room_id)

                if room.game.player_turn_id == user_id:
                    emit('move', request.sid)
            except NotFoundError:
                emit('refresh', room=room_id)

    def on_move_timeout(self):
        if 'room_id' in session and 'user_id' in session:
            room_id = session['room_id']
            user_id = session['user_id']

            try:
                room = Room.get(room_id)
                player_turn = (room.user2_id, room.user2_name) if room.game.player_turn_id == room.user2_id else (room.user1_id, room.user1_name)

                if session['user_id'] != player_turn[0]:
                    socketio = app.extensions['socketio']
                    try:
                        response = socketio.server.call('timeout_response', sid=player_turn[0], namespace=request.namespace, timeout=1)
                    except TimeoutError:
                        response = False

                if not response:
                    send(['', '', '{} has exited the room.'.format(player_turn[1]), datetime.now().strftime('%H:%M:%S')], room=room_id)
                    emit('terminate_client', {'user_id': player_turn[0]}, room=room_id)
                    terminate_room(room_id)
            except NotFoundError:
                emit('refresh', room=room_id)
    
    def on_move(self, data):
        if 'room_id' in session and 'user_id' in session and 'username' in session:
            room_id = session['room_id']
            user_id = session['user_id']
            username = session['username']
            
            try:
                room = Room.get(room_id)

                if room.game.player_turn_id == session['user_id']:
                    try:
                        row = int(data['row'])
                        col = int(data['col'])

                        if room.game.matrix[row][col] != '':
                            emit('refresh', request.sid)
                            return
                        
                        room.game.matrix[row][col] = room.game.player1_sign if room.user1_id == user_id else room.game.player2_sign
                        status, winning_fields = check_matrix(room.game.matrix)

                        player = (room.user2_id, room.user2_name) if room.game.player_turn_id == room.user2_id else (room.user1_id, room.user1_name)
                        if status:
                            if room.user1_id == player[0]:
                                room.game.player1_win_streak += 1
                            else:
                                room.game.player2_win_streak += 1
                            
                            if room.game.player1_win_streak == app.config['BEST_OF_COUNTER'] or room.game.player2_win_streak == app.config['BEST_OF_COUNTER']:
                                data = {
                                    'player_id': player[0],
                                    'player_username': player[1],
                                    'matrix': room.game.matrix,
                                    'winning_fields': winning_fields
                                }

                                send(['', '', '{} {}:{} {}'.format(room.user1_name, room.game.player1_win_streak, room.game.player2_win_streak, room.user2_name), datetime.now().strftime('%H:%M:%S')], room=room_id)
                                send(['', '', '{} has won the game!'.format(player[1]), datetime.now().strftime('%H:%M:%S')], room=room_id)
                                emit('finish_game', data, room=room_id)
                                terminate_room(room_id)
                            else:
                                player_turn = (room.user2_id, room.user2_name) if room.game.player_turn_id == room.user1_id else (room.user1_id, room.user1_name)
                                room.game.player_turn_id = player_turn[0]

                                room.expire(app.config['TTT_ROOM_MOVE_TIMEOUT'])
                                data = {
                                    'player_turn_id': player_turn[0],
                                    'player_turn_username': player_turn[1],
                                    'player_id': player[0],
                                    'player_username': player[1],
                                    'timeout': app.config['TTT_MOVE_TIMEOUT'],
                                    'winning_matrix': room.game.matrix,
                                    'matrix': get_empty_matrix(),
                                    'winning_fields': winning_fields
                                }

                                send(['', '', '{} has won the round!'.format(player[1]), datetime.now().strftime('%H:%M:%S')], room=room_id)
                                send(['', '', '{} {}:{} {}'.format(room.user1_name, room.game.player1_win_streak, room.game.player2_win_streak, room.user2_name), datetime.now().strftime('%H:%M:%S')], room=room_id)
                                send(['', '', '{} turn.'.format(player_turn[1]), datetime.now().strftime('%H:%M:%S')], room=room_id)
                                emit('finish_round', data, room=room_id)

                                clear_matrix(room.game.matrix)
                                room.save()
                        elif check_if_matrix_is_full(room.game.matrix):
                            room.game.player1_win_streak += 1
                            room.game.player2_win_streak += 1

                            if room.game.player1_win_streak == app.config['BEST_OF_COUNTER'] and room.game.player2_win_streak == app.config['BEST_OF_COUNTER']:
                                data = {
                                    'is_draw': True,
                                    'matrix': room.game.matrix
                                }
                                
                                send(['', '', '{} {}:{} {}'.format(room.user1_name, room.game.player1_win_streak, room.game.player2_win_streak, room.user2_name), datetime.now().strftime('%H:%M:%S')], room=room_id)
                                send(['', '', 'Game draw...', datetime.now().strftime('%H:%M:%S')], room=room_id)
                                emit('finish_game', data, room=room_id)
                                terminate_room(room_id)
                            elif room.game.player1_win_streak == app.config['BEST_OF_COUNTER'] or room.game.player2_win_streak == app.config['BEST_OF_COUNTER']:
                                send(['', '', '{} {}:{} {}'.format(room.user1_name, room.game.player1_win_streak, room.game.player2_win_streak, room.user2_name), datetime.now().strftime('%H:%M:%S')], room=room_id)
                                if room.game.player1_win_streak == app.config['BEST_OF_COUNTER']:
                                    data = {
                                        'player_id': room.user1_id,
                                        'player_username': room.user1_name,
                                        'matrix': room.game.matrix,
                                        'winning_fields': winning_fields
                                    }
                                    send(['', '', '{} has won the game!'.format(room.user1_name), datetime.now().strftime('%H:%M:%S')], room=room_id)
                                elif room.game.player2_win_streak == app.config['BEST_OF_COUNTER']:
                                    data = {
                                        'player_id': room.user2_id,
                                        'player_username': room.user2_name,
                                        'matrix': room.game.matrix,
                                        'winning_fields': winning_fields
                                    }
                                    send(['', '', '{} has won the game!'.format(room.user2_name), datetime.now().strftime('%H:%M:%S')], room=room_id)

                                emit('finish_game', data, room=room_id)
                                terminate_room(room_id)
                            else:
                                player_turn = (room.user2_id, room.user2_name) if room.game.player_turn_id == room.user1_id else (room.user1_id, room.user1_name)
                                room.game.player_turn_id = player_turn[0]

                                room.expire(app.config['TTT_ROOM_MOVE_TIMEOUT'])
                                data = {
                                    'player_turn_id': player_turn[0],
                                    'player_turn_username': player_turn[1],
                                    'is_draw': True,
                                    'timeout': app.config['TTT_MOVE_TIMEOUT'],
                                    'winning_matrix': room.game.matrix,
                                    'matrix': get_empty_matrix()
                                }

                                send(['', '', 'Round draw...', datetime.now().strftime('%H:%M:%S')], room=room_id)
                                send(['', '', '{} {}:{} {}'.format(room.user1_name, room.game.player1_win_streak, room.game.player2_win_streak, room.user2_name), datetime.now().strftime('%H:%M:%S')], room=room_id)
                                send(['', '', '{} turn.'.format(player_turn[1]), datetime.now().strftime('%H:%M:%S')], room=room_id)
                                emit('finish_round', data, room=room_id)

                                clear_matrix(room.game.matrix)
                                room.save()
                        else:
                            player_turn = (room.user2_id, room.user2_name) if room.game.player_turn_id == room.user1_id else (room.user1_id, room.user1_name)
                            room.game.player_turn_id = player_turn[0]
                            room.save()

                            room.expire(app.config['TTT_ROOM_MOVE_TIMEOUT'])
                            data = {
                                'player_turn_id': player_turn[0],
                                'player_turn_username': player_turn[1],
                                'timeout': app.config['TTT_MOVE_TIMEOUT'],
                                'matrix': room.game.matrix
                            }
                            
                            send(['', '', '{} turn.'.format(player_turn[1]), datetime.now().strftime('%H:%M:%S')], room=room_id)
                            emit('update_game', data, room=room_id)
                    except (IndexError, TypeError):
                        send(['', '', '{} has exited the room.'.format(username), datetime.now().strftime('%H:%M:%S')], room=room_id)
                        emit('terminate_client', {'user_id': user_id}, room=room_id)
                        terminate_room(room_id)
            except NotFoundError:
                emit('refresh', room=room_id)
    
    def on_termination(self):
        if 'room_id' not in session or 'user_id' not in session or 'username' not in session:
            session.clear()
            return

        room_id = session['room_id']
        user_id = session['user_id']
        username = session['username']

        send(['', '', '{} has exited the room.'.format(username), datetime.now().strftime('%H:%M:%S')], room=room_id)
        emit('terminate_client', {'user_id': user_id}, room=room_id)

        terminate_room(room_id)