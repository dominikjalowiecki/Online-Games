from pydantic import BaseModel, constr, validator, ValidationError
from flask import escape, session
from flask_socketio import Namespace, send
from abc import ABC
from datetime import datetime
from .. import app

class ChatMessage(BaseModel):
    message: constr(min_length=1, max_length=200)

    @validator('message')
    def sanitize_message(cls, value):
        new_value = escape(str(value).strip())
        if len(new_value) == 0:
            raise ValueError('Must containt non whitespace character')

        return escape(str(value).strip())

class NamespaceBase(Namespace, ABC):
    def on_message(self, data):
        if 'room_id' in session and 'user_id' in session and 'username' in session:
            room_id = session['room_id']
            user_id = session['user_id']
            username = session['username']

            try:
                chat_message = ChatMessage(message = data['message'])
                payload = [user_id, username, chat_message.message, datetime.now().strftime('%H:%M:%S')]
                send(payload, room=room_id)
            except ValidationError:
                pass

    def on_error_default(self, e):
        app.logger.error(">> An error has occured: " + str(e))