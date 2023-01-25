from . import app
from flask import session, request, redirect, url_for
from .helper_functions import check_if_room_exists

@app.before_request
def check_if_is_in_room():
    # If not spectator - redirect to assigned room
    if all(session_key in session for session_key in ('room_id', 'user_id', 'room_endpoint')):
        if request.endpoint not in ('static', 'exit_room'):
            if request.base_url != url_for(session['room_endpoint'], room_id=session['room_id'], _external=True):
                if check_if_room_exists(session['room_id']):
                    return redirect(url_for(session['room_endpoint'], room_id=session['room_id']))
                else:
                    session.clear()
            else:
                if not check_if_room_exists(session['room_id']):
                    session.clear()
                    return redirect(url_for('index'))