from flask import render_template, session, redirect, url_for, request, flash
from uuid import uuid4
from . import app
from .models import Room
from .forms import ChatForm
import re
from uuid import uuid4
from .helper_functions import (
    generate_username,
    pagination,
    get_room,
    create_room_helper,
    GameEnum,
    category_helper,
    terminate_room,
    handle_room_exists
)
from redis_om import Migrator

Migrator().run()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/search')
def search():
    # Validate search phrase if contains only word characters (quick workaround for problem with full-text search of non word characters)
    search_phrase = request.args.get('s', '', type=str)
    search_phrase = search_phrase if re.search('^\w[\w ]{0,49}$', search_phrase) else ''

    if search_phrase != '':
        query = Room.find(Room.description % search_phrase)
    else:
        query = Room.find()

    rooms = query.all()
    results_number = len(rooms)
    page, max_page, page_size = pagination(results_number)
    rooms = rooms[page_size * (page - 1):page_size * page]

    return render_template('rooms.html', title=f'Search results for: {search_phrase}', rooms=rooms, results_number=results_number, search_phrase=search_phrase, page=page, max_page=max_page)


@app.route('/tic-tac-toe', methods=['GET', 'POST'])
def tic_tac_toe():
    return category_helper('tic_tac_toe_create_room', 'Tic Tac Toe')

@app.route('/pong', methods=['GET', 'POST'])
def pong():
    return category_helper('pong_create_room', 'Pong')

@app.route('/tic-tac-toe/create-room')
def tic_tac_toe_create_room():
    ttt_games_count = Room.find(Room.game_type == 'tic_tac_toe').count()
    if ttt_games_count >= app.config['MAX_TTT_GAMES']:
        flash('Max tic-tac-toe games achieved...')
        return redirect(url_for('index'))

    return create_room_helper('tic_tac_toe_room', 'tic_tac_toe', GameEnum.TIC_TAC_TOE, 'Tic Tac Toe')

@app.route('/pong/create-room')
def pong_create_room():
    pong_games_count = Room.find(Room.game_type == 'pong').count()
    if pong_games_count >= app.config['MAX_PONG_GAMES']:
        flash('Max pong games achieved...')
        return redirect(url_for('index'))

    return create_room_helper('pong_room', 'pong', GameEnum.PONG, 'Pong')

@app.route('/tic-tac-toe/room/<room_id>')
def tic_tac_toe_room(room_id):
    handle_room_exists(room_id)
    form = ChatForm()

    if 'room_id' in session and 'user_id' in session and session['room_id'] == room_id:
        return render_template('tic-tac-toe-room.html', room_id=room_id, form=form, bo=app.config['BEST_OF_SYSTEM'])
    else:
        session['room_id'] = room_id
        return render_template('tic-tac-toe-room-spectate.html', bo=app.config['BEST_OF_SYSTEM'])

@app.route('/pong/room/<room_id>')
def pong_room(room_id):
    handle_room_exists(room_id)
    form = ChatForm()

    if 'room_id' in session and 'user_id' in session and session['room_id'] == room_id:
        return render_template('pong-room.html', room_id=room_id, form=form, bo=app.config['BEST_OF_SYSTEM'])
    else:
        session['room_id'] = room_id
        return render_template('pong-room-spectate.html')

@app.route('/join-room/<room_id>')
def og_join_room(room_id):
    room = get_room(room_id)
    
    if room.user_count == 2:
        flash('Max users count in room...')
        return redirect(url_for('index'))

    user_id = uuid4().hex
    username = generate_username()

    room.user2_id = user_id
    room.user2_name = username
    room.user_count += 1
    room.save()
    room.expire(app.config['TTT_START_GAME_TIMEOUT'])

    session.clear()
    session['user_id'] = user_id
    session['username'] = username
    session['room_id'] = room_id

    endpoint = ('tic_tac_toe_room' if room.category == 'Tic Tac Toe' else 'pong_room')
    session['room_endpoint'] = endpoint

    return redirect(url_for(endpoint, room_id=room_id))

@app.route('/exit-room')
def exit_room():
    # If not spectator - terminate room
    if 'room_id' in session and 'user_id' in session:
        terminate_room(session['room_id'])
        
    return redirect(url_for('index'))