from redis_om import JsonModel, EmbeddedJsonModel, Field
from abc import ABC
from pydantic import StrictInt, constr, conlist
from datetime import datetime

class RoomModel(JsonModel, ABC):
    description: str = Field(index=True, full_text_search=True, min_length=1, max_length=50)
    category: str = Field(index=True)
    user1_id: str
    user1_name: str
    is_user1_ready: bool = False
    user2_id: str = ''
    user2_name: str = ''
    is_user2_ready: bool = False
    user_count: int = Field(sortable=True, default=1)
    is_game_started: bool = False
    created_at: datetime
    connections: list[str] = []

class TicTacToeGame(EmbeddedJsonModel):
    matrix: conlist(conlist(constr(max_length=1), min_items=3, max_items=3), min_items=3, max_items=3) = [
                        ['', '', ''],
                        ['', '', ''],
                        ['', '', '']
                    ]
    player1_sign: constr(min_length=0, max_length=1) = ''
    player1_win_streak: StrictInt = 0
    player2_sign: constr(min_length=0, max_length=1) = ''
    player2_win_streak: StrictInt = 0
    player_turn_id: str = ''

class PongGame(EmbeddedJsonModel):
    task_id: str = ''

class Room(RoomModel):
    game: EmbeddedJsonModel
    game_type:str = Field(index=True)

    class Meta:
        model_key_prefix = 'Room'