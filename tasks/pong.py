import os

os.environ['SDL_VIDEODRIVER'] = 'dummy'
os.environ['PYGAME_HIDE_SUPPORT_PROMPT'] = 'hide'

import pygame
from pygame.locals import *
from pygame.math import Vector2
from random import choice
from enum import Enum
from flask_socketio import SocketIO
import json

class GameObjMixin:
    def set_rect_default(self):
        self.rect = pygame.Rect(
            self._pos_x,
            self._pos_y,
            0,
            0
        ).inflate(
            self._width,
            self._height
        )

class Platform(GameObjMixin, pygame.sprite.Sprite):
    def __init__(self, width, height, color, pos_x, pos_y, velocity):
        super().__init__()

        self._pos_x = pos_x
        self._pos_y = pos_y
        self._width = width
        self._height = height

        self.image = pygame.Surface((width, height))
        self.image.fill(color)
        self.set_rect_default()

        self._pos_center = Vector2(self.rect.center)
        self._velocity = velocity
    
    def set_default(self):
        self.set_rect_default()
        self._pos_center = Vector2(self.rect.center)

    @property
    def velocity(self):
        return self._velocity

    def set_top(self, y):
        self.rect.top = y
        self._pos_center = Vector2(self.rect.center)
    
    def set_bottom(self, y):
        self.rect.bottom = y
        self._pos_center = Vector2(self.rect.center)
    
    def move_up(self, dt):
        self._pos_center -= (self._velocity * (dt / 1000))
        self.rect.center = self._pos_center

    def move_down(self, dt):
        self._pos_center += (self._velocity * (dt / 1000))
        self.rect.center = self._pos_center

class Ball(GameObjMixin, pygame.sprite.Sprite):
    def __init__(self, radius, color, pos_x, pos_y, acceleration, velocity):
        super().__init__()

        self._pos_x = pos_x
        self._pos_y = pos_y
        self._width = self._height = 2 * radius
        self._default_velocity = velocity
        self._default_velocity.x = abs(self._default_velocity.x)
        self._default_velocity.y = abs(self._default_velocity.y)

        self.image = pygame.Surface((radius * 2, radius * 2), pygame.SRCALPHA)
        pygame.draw.circle(self.image, color, (radius, radius), radius)
        self.set_rect_default()

        self._pos_center = Vector2(self.rect.center)
        self._acceleration = acceleration
        self._velocity = self._default_velocity.copy()
    
    def set_default(self):
        self.set_rect_default()

        self._pos_center = Vector2(self.rect.center)

        sign = (-1 if self._velocity.x >= 0 else 1)
        self._velocity = self._default_velocity.copy()
        self._velocity.x *= sign
        self._velocity.y *= choice((1, -1))

    def move(self, dt):
        self._velocity.x += ((self._acceleration if self._velocity.x >= 0 else -self._acceleration) * (dt / 1000))

        self._pos_center += (self._velocity * (dt / 1000))
        self.rect.center = self._pos_center
    
    def world_bounce(self):
        self._velocity.y *= -1
    
    @property
    def velocity(self):
        return self._velocity

    @property
    def top(self):
        return self.rect.top
    
    @top.setter
    def top(self, value):
        self.rect.top = value
        self._pos_center = Vector2(self._pos_center.x, self.rect.centery)

    @property
    def bottom(self):
        return self.rect.bottom
    
    @bottom.setter
    def bottom(self, value):
        self.rect.bottom = value
        self._pos_center = Vector2(self._pos_center.x, self.rect.centery)

    @property
    def left(self):
        return self.rect.left
    
    @left.setter
    def left(self, value):
        self.rect.left = value
        self._pos_center = Vector2(self.rect.centerx, self._pos_center.y)

    @property
    def right(self):
        return self.rect.right
    
    @right.setter
    def right(self, value):
        self.rect.right = value
        self._pos_center = Vector2(self.rect.centerx, self._pos_center.y)

class Game:
    def __init__(self, task, game_id='', players={}, bo_counter=1, model_prefix='', debug=False):
        self._debug = debug

        if not self._debug:
            self._players = players
            self._bo_counter = bo_counter
            self._model_prefix = model_prefix
            self._redis = task.backend.client
            self._task = task
            self._sub = self._redis.pubsub(ignore_subscribe_messages=True)
            self._sub.subscribe(game_id)
            self._game_id = game_id
            self._socketio = SocketIO(message_queue=os.environ['REDIS_MESSAGE_QUEUE_URL'], channel=os.environ['SOCKETIO_REDIS_CHANNEL'], logger=False, engineio_logger=False)

        self._display_surf = None
        self._running = True
        self._clock = None
        self._tickrate = 40 # Tickrate of server

        self._dt = self._dt_fixed = 1000 / self._tickrate
        self._primary_color = (255, 255, 255)
        self.size = self.width, self.height = 640, 360

        self._player1_wins = self._player2_wins = 0
        self._player1_tick_count = self._player2_tick_count = 0

        self._platform1 = None
        self._platform2 = None
        self._ball = None

        self._platform_config = {
            'width': 20,
            'height': 100,
            'margin': 45,
            'collision_offset': 20,
            'velocity': Vector2(0, 750)
        }

        self._ball_config = {
            'radius': 10,
            'initial_velocity': Vector2(choice((-150, 150)), choice((-150, 150))),
            'acceleration': 10
        }
    
    class UserEvents(Enum):
        SEND_SYNC_EVENT = pygame.USEREVENT
        MOVE_EVENT = pygame.USEREVENT + 1
    
    class PubSubMessageType(Enum):
        STATUS = 0x0
        SYNC = 0x1

    class UserCommands(Enum):
        UP = 0x0
        DOWN = 0x1
    
    def restart_game(self):
        self._ball.set_default()
    
    def handle_round(self):
        if not self._debug:
            data = {
                'player1_wins': self._player1_wins,
                'player2_wins': self._player2_wins
            }

            self._task.update_state(state='PROGRESS', meta=data)
            self._socketio.emit('finish_round', data, namespace='/pong', room=self._game_id)

            if self._player1_wins == self._bo_counter:
                self._running = False
                data = {
                    'winner_id': self._players['player1']['id'],
                    'winner_nick': self._players['player1']['nick']
                }
                self._redis.delete(f'{self._model_prefix}{self._game_id}')
                return self._socketio.emit('finish_game', data, namespace='/pong', room=self._game_id)
            elif self._player2_wins == self._bo_counter:
                self._running = False
                data = {
                    'winner_id': self._players['player2']['id'],
                    'winner_nick': self._players['player2']['nick']
                }
                self._redis.delete(f'{self._model_prefix}{self._game_id}')
                return self._socketio.emit('finish_game', data, namespace='/pong', room=self._game_id)

        self.restart_game()

    def on_init(self):
        pygame.init()

        self._display_surf = pygame.display.set_mode(self.size, pygame.HWSURFACE | pygame.DOUBLEBUF)

        self._running = True
        self._clock = pygame.time.Clock()

        self._platform1 = Platform(
            self._platform_config['width'],
            self._platform_config['height'],
            self._primary_color,
            self._platform_config['margin'],
            self.height // 2,
            self._platform_config['velocity']
        )
        
        self._platform2 = Platform(
            self._platform_config['width'],
            self._platform_config['height'],
            self._primary_color,
            self.width - self._platform_config['margin'],
            self.height // 2,
            self._platform_config['velocity']
        )

        self._ball = Ball(
            self._ball_config['radius'],
            self._primary_color,
            *self._display_surf.get_rect().center,
            self._ball_config['acceleration'],
            self._ball_config['initial_velocity']
        )

        self._server_state = {
            'platform1_y': self._platform1.rect.center[1],
            'platform2_y': self._platform2.rect.center[1],
            'ball': self._ball.rect.center
        }

        self.all_group = pygame.sprite.Group([
            self._platform1,
            self._platform2,
            self._ball
        ])

        if not self._debug:
            data = {
                'tickrate': self._tickrate
            }
            self._socketio.emit('start_game', data, namespace='/pong', room=self._game_id)

    def on_event(self, event):
        if event.type == pygame.QUIT:
            self._running = False
        elif event.type == self.UserEvents.MOVE_EVENT.value:
            platform = event.platform
            command = event.command
            user_tick_count = event.user_tick_count
            self.move_platform(platform, command, user_tick_count)
        elif event.type == self.UserEvents.SEND_SYNC_EVENT.value:
            socket_id = event.socket_id
            data = {
                'tickrate': self._tickrate,
                'player1_wins': self._player1_wins,
                'player2_wins': self._player2_wins
            }
            data = {
                **data,
                **self._server_state
            }
            self._socketio.emit('sync', data, namespace='/pong', to=socket_id)

    def move_platform(self, platform, command, user_tick_count=0):
        if command == self.UserCommands.UP.value:
            platform.move_up(self._dt)
            if platform.rect.top < 0:
                platform.set_top(0)
        elif command == self.UserCommands.DOWN.value:
            platform.move_down(self._dt)
            if platform.rect.bottom > self.height:
                platform.set_bottom(self.height)

        if not self._debug:
            if platform == self._platform1:
                self._player1_tick_count = user_tick_count
            elif platform == self._platform2:
                self._player2_tick_count = user_tick_count

    def on_control(self):
        if self._debug:
            keys = pygame.key.get_pressed()

            if keys[pygame.K_UP]:
                    pygame.event.post(
                        pygame.event.Event(self.UserEvents.MOVE_EVENT.value, platform=self._platform1, command=self.UserCommands.UP.value, user_tick_count=0)
                    )
                    pygame.event.post(
                        pygame.event.Event(self.UserEvents.MOVE_EVENT.value, platform=self._platform2, command=self.UserCommands.UP.value, user_tick_count=0)
                    )
            if keys[pygame.K_DOWN]:
                    pygame.event.post(
                        pygame.event.Event(self.UserEvents.MOVE_EVENT.value, platform=self._platform1, command=self.UserCommands.DOWN.value, user_tick_count=0)
                    )
                    pygame.event.post(
                        pygame.event.Event(self.UserEvents.MOVE_EVENT.value, platform=self._platform2, command=self.UserCommands.DOWN.value, user_tick_count=0)
                    )
        else:
            user_commands = self._sub.get_message()

            if user_commands:
                message = json.loads(user_commands['data'].decode('utf-8'))

                try:
                    type, player_id, command, user_tick_count = message
                except ValueError:
                    type, socket_id = message

                if type == self.PubSubMessageType.STATUS.value:
                    if player_id == self._players['player1']['id']:
                        pygame.event.post(
                            pygame.event.Event(self.UserEvents.MOVE_EVENT.value, platform=self._platform1, command=command, user_tick_count=user_tick_count)
                        )
                    elif player_id == self._players['player2']['id']:
                        pygame.event.post(
                            pygame.event.Event(self.UserEvents.MOVE_EVENT.value, platform=self._platform2, command=command, user_tick_count=user_tick_count)
                        )
                elif type == self.PubSubMessageType.SYNC.value:
                    pygame.event.post(
                        pygame.event.Event(self.UserEvents.SEND_SYNC_EVENT.value, socket_id=socket_id)
                    )

    def on_loop(self):
        self._ball.move(self._dt)

        if self._ball.rect.top < 0:
            self._ball.top = 0
            self._ball.world_bounce()

        if self._ball.rect.bottom > self.height:
            self._ball.bottom = self.height
            self._ball.world_bounce()
        
        if self._ball.rect.left < 0:
            self._player2_wins += 1
            self.handle_round()

        if self._ball.rect.right > self.width:
            self._player1_wins += 1
            self.handle_round()

        coords = pygame.sprite.collide_mask(self._platform1, self._ball)
        if coords:
            coord_x, coord_y = coords
            coord_x += 1
            coord_y += 1
            if coord_x > (self._platform1.rect.width - (self._ball.rect.width // 2)):
                self._ball.left = self._platform1.rect.right

                if coord_y < ((self._platform1.rect.height // 2) - self._platform_config['collision_offset']):
                    diff = ((self._platform1.rect.height // 2) - coord_y)
                    self._ball.velocity.y = -8 * diff
                elif coord_y > ((self._platform1.rect.height // 2) + self._platform_config['collision_offset']):
                    diff = abs((self._platform1.rect.height // 2) - coord_y)
                    self._ball.velocity.y = 8 * diff
                else:
                    self._ball.velocity.y = choice((-50, 50))

                self._ball.velocity.x *= -1
            else:
                if coord_y <= (self._platform1.rect.height // 2):
                    self._ball.bottom = self._platform1.rect.top
                    self._ball.velocity.y = -self._ball.velocity.y if self._ball.velocity.y >= 0 else self._ball.velocity.y
                else:
                    self._ball.top = self._platform1.rect.bottom
                    self._ball.velocity.y = self._ball.velocity.y if self._ball.velocity.y >= 0 else -self._ball.velocity.y                
        
        coords = pygame.sprite.collide_mask(self._platform2, self._ball)
        if coords:
            coord_x, coord_y = coords
            coord_x += 1
            coord_y += 1
            if coord_x < (self._platform1.rect.width - (self._ball.rect.width // 2)):
                self._ball.right = self._platform2.rect.left

                if coord_y < ((self._platform2.rect.height // 2) - self._platform_config['collision_offset']):
                    diff = ((self._platform2.rect.height // 2) - coord_y)
                    self._ball.velocity.y = -8 * diff
                elif coord_y > ((self._platform2.rect.height // 2) + self._platform_config['collision_offset']):
                    diff = abs((self._platform2.rect.height // 2) - coord_y)
                    self._ball.velocity.y = 8 * diff
                else:
                    self._ball.velocity.y = choice((-50, 50))

                self._ball.velocity.x *= -1
            else:
                if coord_y <= (self._platform2.rect.height // 2):
                    self._ball.bottom = self._platform2.rect.top
                    self._ball.velocity.y = -self._ball.velocity.y if self._ball.velocity.y >= 0 else self._ball.velocity.y
                else:
                    self._ball.top = self._platform2.rect.bottom
                    self._ball.velocity.y = -self._ball.velocity.y if self._ball.velocity.y >= 0 else self._ball.velocity.y

        if not self._debug:
            data = {}

            # Delta compression
            if self._server_state['platform1_y'] != self._platform1.rect.center[1]:
                data['platform1_y'] = self._platform1._pos_center[1]
                data['player1_tick_count'] = self._player1_tick_count
                self._server_state['platform1_y'] = data['platform1_y']
            
            if self._server_state['platform2_y'] != self._platform2.rect.center[1]:
                data['platform2_y'] = self._platform2._pos_center[1]
                data['player2_tick_count'] = self._player2_tick_count
                self._server_state['platform2_y'] = data['platform2_y']

            if self._server_state['ball'] != self._ball.rect.center:
                data['ball'] = tuple(self._ball.rect.center)
                self._server_state['ball'] = tuple(data['ball'])
            
            self._socketio.emit('update_game', data, namespace='/pong', room=self._game_id)

    def on_render(self):
        if self._debug:
            self._display_surf.fill(0)
            self.all_group.draw(self._display_surf)
            pygame.display.flip()

        self._dt = self._clock.tick(self._tickrate)
        self._dt = min(self._dt, self._dt_fixed)

    def on_cleanup(self):
        pygame.quit()
    
    def on_execute(self):
        if self.on_init() == False:
            self._running = False

        while self._running:
            self.on_control()

            for event in pygame.event.get():
                self.on_event(event)

            self.on_loop()

            self.on_render()
        
        self.on_cleanup()

        if not self._debug: self._sub.unsubscribe(self._game_id)

        return True

if __name__ == '__main__':
    game = Game(testing=True)
    res = game.on_execute()
    print(res)