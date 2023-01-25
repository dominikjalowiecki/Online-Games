from typing import Optional
from uuid import uuid4
import random
from math import ceil
from flask import request, abort, session, redirect, flash, url_for, render_template
from .forms import DescriptionForm
from .models import Room, TicTacToeGame, PongGame
from enum import Enum
from app import app
from redis_om import NotFoundError
from pydantic import ValidationError
from datetime import datetime
from flask_socketio import disconnect, close_room

def terminate_room(room_id: str) -> None:
    try:
        # If application context recognize websocket details - close room and all connections
        if hasattr(request, 'namespace'):
            close_room(room_id)
            room = Room.get(room_id)
            for connection in room.connections:
                    disconnect(connection)
        Room.delete(room_id)
    except NotFoundError:
        pass

    session.clear()

def category_helper(endpoint: str, category: str) -> "render_template":
    form = DescriptionForm(request.form)
    if request.method == 'POST' and form.validate():
         return redirect(url_for(endpoint, description=form.description.data))
    
    query = Room.find(Room.category == category)

    rooms = query.all()
    results_number = len(rooms)
    page, max_page, page_size = pagination(results_number)
    rooms = rooms[page_size * (page - 1):page_size * page]

    return render_template('rooms.html', title=f'{category} Rooms', rooms=rooms, form=form, page=page, results_number=results_number, max_page=max_page)

class GameEnum(Enum):
    TIC_TAC_TOE = TicTacToeGame
    PONG = PongGame

def create_room_helper(endpoint: str, fallback_endpoint: str, game: "GameEnum", category: str) -> "redirect":
    description = request.args.get('description')
    user_id = uuid4().hex
    username = generate_username()

    try:
        room = Room(
            description=description,
            category=category,
            user1_id=user_id,
            user1_name=username,
            game=(game.value)(),
            game_type=fallback_endpoint,
            created_at=datetime.now()
        )
    except ValidationError as e:
        flash('Something went wrong...')
        return redirect(url_for(fallback_endpoint))
        
    room.save()
    room.expire(app.config['TTT_NEW_ROOM_TIMEOUT'])

    session.clear()
    session['user_id'] = user_id
    session['username'] = username
    session['room_id'] = room.pk
    session['room_endpoint'] = endpoint

    return redirect(url_for(endpoint, room_id=room.pk))

def get_room(room_id: str) -> Optional[Room.get]:
    try:
        return Room.get(room_id)
    except NotFoundError:
        abort(404)

def check_if_room_exists(room_id: str) -> bool:
    return Room.db().exists(f':{Room.Meta.model_key_prefix}:{room_id}')

def handle_room_exists(room_id: str):
    if check_if_room_exists(room_id):
        return
    else:
        abort(404)


def pagination(keys_number: int) -> tuple[int, int ,int]:
    page_size = app.config['PAGE_SIZE']
    if keys_number != 0:
        max_page = ceil((keys_number) / page_size)
    else:
        max_page = 1

    try:
        page = request.args.get('page', 1, type=int)
        if page < 1 or page > max_page:
            raise ValueError
        return page, max_page, page_size
    except ValueError:
        page = 1
        return page, max_page, page_size

def generate_username() -> str:
    adjectives = ('Large', 'Green', 'Stinky', 'Rude', 'Smilling')
    nouns = ('Plankton', 'Rat', 'Dog', 'Goblin', 'Creature')

    return f'{random.choice(adjectives)} {random.choice(nouns)}'