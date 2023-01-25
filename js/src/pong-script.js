import {socketBase, onMessage, setChat, PopupManager} from './socket-base.mjs';

let controller_command = null;
function create_controller()
{
    const CONTROLLER_HTML = `
        <div id="game-controller">
            <div id="game-controller-up-arrow" class="game-controller-arrow">▲</div>
            <div id="game-controller-down-arrow" class="game-controller-arrow">▼</div>
        </div>
    `;

    $('body').prepend(CONTROLLER_HTML);
    const CONTROLLER = $('#game-controller');
    let move = false;
    let click_offset;


    CONTROLLER.on('touchmove', (e) => {
        if(e.target.id === 'game-controller')
        {
            if(move)
                CONTROLLER.css({top: (e.touches[0].clientY-click_offset[1]), left: (e.touches[0].clientX-click_offset[0])});
        }
        
        return false;
    });

    CONTROLLER.on('touchstart', (e) => {
        if(e.target.id === 'game-controller')
        {
            const TARGET_OFFSET = $(e.target).offset();
            click_offset = [e.touches[0].pageX - TARGET_OFFSET.left, e.touches[0].pageY - TARGET_OFFSET.top];
            move = true;
        } else if(e.target.id === 'game-controller-up-arrow')
        {
            controller_command = USER_COMMANDS.UP;
        } else if(e.target.id === 'game-controller-down-arrow')
        {
            controller_command = USER_COMMANDS.DOWN;
        }

        return false;
    });

    CONTROLLER.on('touchend', (e) => {
        move = false;
        controller_command = null;

        return false;
    });

    CONTROLLER.mousemove((e) => {
        if(e.target.id === 'game-controller')
        {
            if(move)
            {
                CONTROLLER.css({top: (e.clientY-click_offset[1]), left: (e.clientX-click_offset[0])});
            }
        }

        return false;
    });

    const LMB = 1;
    CONTROLLER.mousedown((e) => {
        if(e.target.id === 'game-controller' && e.which === LMB)
        {
            click_offset = [e.offsetX, e.offsetY];
            move = true;
        } else if(e.target.id === 'game-controller-up-arrow')
        {
            controller_command = USER_COMMANDS.UP;
        } else if(e.target.id === 'game-controller-down-arrow')
        {
            controller_command = USER_COMMANDS.DOWN;
        }

        return false;
    });

    CONTROLLER.mouseup((e) => {
        move = false;
        controller_command = null;

        return false;
    });

    CONTROLLER.mouseout((e) => {
        move = false;
        controller_command = null;

        return false;
    });
}
create_controller();

const USER_COMMANDS = {
	UP: 0x0,
    DOWN: 0x1
}

class Scene extends Phaser.Scene
{
    #width;
    #height;
    #primary_color;
    #your_color;
    #platform_config;
    #ball_config;
    #platform1;
    #platform2;
    #ball;
    #cursors;
    #timer;
    #is_second_player;

    #user_status_tickrate;
    #server_tickrate;
    #lerp_time_factor = 1;
    #platform1_y_server_pos;
    #platform2_y_server_pos;
    #ball_server_pos;

    #score_text;
    #latency_text;
    #fps_text;

    #latency = 0;

    #prev_update_timestamp = Date.now();

    #prediction;
    #reconciliation;
    #interpolation;
    
    #user_tick_count;

    #command;

    #buffer_size = 1024;
    #state_buffer = [];
    #input_buffer = [];
    #last_processed_state = {};

    #server_latency = 0;

    constructor(config)
    {
        super(config);
    }

    init(data)
    {
        this.#prediction = $('#prediction');
        this.#reconciliation = $('#reconciliation');
        this.#interpolation = $('#interpolation');

        this.#width = this.sys.game.config.width;
        this.#height = this.sys.game.config.height;
        this.#primary_color = 0x000;
        this.#your_color = 0x777;

        this.#is_second_player = data.is_second_player;
        this.#server_tickrate = 40; // Tickrate of server
        this.#user_status_tickrate = 15; // Tickrate of client input

        this.#user_tick_count = 0;

        this.#platform_config = {
            width: 20,
            height: 100,
            margin: 45,
            colider_offset: 20,
            velocity: [0, 750]
        };

        this.#ball_config = {
            radius: 10
        };
    }

    preload()
    {
        this.load.bitmapFont('my_font', '/static/fonts/bitmapFonts/my_font.png', '/static/fonts/bitmapFonts/my_font.fnt');
    }

    create()
    {
        this.#score_text = this.add.bitmapText(this.#width / 2 - 85, this.#height / 2 - 50, 'my_font', '0:0', 128);
        this.#latency_text = this.add.bitmapText(5, 5, 'my_font', `Server state latency: ${this.#latency}ms`, 16);
        this.#fps_text = this.add.bitmapText(this.#width - 70, 5, 'my_font', `FPS: 0`, 16);

        this.physics.world.setBoundsCollision(false, false, true, true);

        this.#platform1 = this.add.rectangle(
            (0 + this.#platform_config.margin),
            (this.#height / 2),
            this.#platform_config.width,
            this.#platform_config.height,
            this.#primary_color
        );
        this.#platform1_y_server_pos = this.#platform1.y;

        this.#platform2 = this.add.rectangle(
            (this.#width - this.#platform_config.margin),
            (this.#height / 2),
            this.#platform_config.width,
            this.#platform_config.height,
            this.#primary_color
        );
        this.#platform2_y_server_pos = this.#platform2.y;

        if(this.#is_second_player)
        {
            this.#platform2.fillColor = this.#your_color;
        } else
        {
            this.#platform1.fillColor = this.#your_color;
        }

        this.#ball = this.add.circle(
            (this.#width / 2),
            (this.#height / 2),
            this.#ball_config.radius,
            this.#primary_color
        );
        this.#ball_server_pos = [this.#ball.x, this.#ball.y];

        this.#cursors = this.input.keyboard.addKeys({ 'up': Phaser.Input.Keyboard.KeyCodes.UP, 'down': Phaser.Input.Keyboard.KeyCodes.DOWN });

        this.physics.add.existing(this.#platform1);
        this.physics.add.existing(this.#platform2);
        this.physics.add.existing(this.#ball);

        this.#platform1.body.setCollideWorldBounds(true)
                            .setImmovable(true);
        this.#platform1.body.allowGravity = false;

        this.#platform2.body.setCollideWorldBounds(true)
                            .setImmovable(true);
        this.#platform2.body.allowGravity = false;

        this.#ball.body.setCircle(this.#ball_config.radius)
                        .setCollideWorldBounds(true, 1, 1)
                        .setBounce(1);

        this.#timer = this.time.addEvent({
            delay: Math.floor(1000 / this.#user_status_tickrate),
            callback: () => {
                this.#command = (this.#cursors.up.isDown ? USER_COMMANDS.UP: (this.#cursors.down.isDown ? USER_COMMANDS.DOWN : controller_command));
                if(this.#command !== null)
                {
                    ++this.#user_tick_count;
                    this.#input_buffer[this.#user_tick_count] = this.#command;
                    SOCKET.volatile.emit('player_status', { command: this.#command, user_tick: this.#user_tick_count });

                    const BUFFER_TICK = this.#user_tick_count % this.#buffer_size;
                    if(this.#prediction[0].checked)
                    {
                        if(this.#command === USER_COMMANDS.UP)
                        {
                            if(!this.#is_second_player)
                            {
                                this.#platform1_y_server_pos = this.#platform1_y_server_pos - (this.#platform_config.velocity[1] * (Math.floor(1 / this.#server_tickrate * 1000) / 1000))
                                if(this.#platform1_y_server_pos < 50) this.#platform1_y_server_pos = 50;
                                this.#state_buffer[BUFFER_TICK] = this.#platform1_y_server_pos;
                            } else
                            {
                                this.#platform2_y_server_pos = this.#platform2_y_server_pos - (this.#platform_config.velocity[1] * (Math.floor(1 / this.#server_tickrate * 1000) / 1000))
                                if(this.#platform2_y_server_pos < 50) this.#platform2_y_server_pos = 50;
                                this.#state_buffer[BUFFER_TICK] = this.#platform2_y_server_pos;
                            }
                        } else if(this.#command === USER_COMMANDS.DOWN)
                        {
                            if(!this.#is_second_player)
                            {
                                this.#platform1_y_server_pos = this.#platform1_y_server_pos + (this.#platform_config.velocity[1] * (Math.floor(1 / this.#server_tickrate * 1000) / 1000))
                                if(this.#platform1_y_server_pos > 310) this.#platform1_y_server_pos = 310;
                                this.#state_buffer[BUFFER_TICK] = this.#platform1_y_server_pos;
                            } else
                            {

                                this.#platform2_y_server_pos = this.#platform2_y_server_pos + (this.#platform_config.velocity[1] * (Math.floor(1 / this.#server_tickrate * 1000) / 1000))
                                if(this.#platform2_y_server_pos > 310) this.#platform2_y_server_pos = 310;
                                this.#state_buffer[BUFFER_TICK] = this.#platform2_y_server_pos;
                            }
                        }
                    }
                }
            },
            args: [],
            callbackScope: this,
            loop: true
        });

        SOCKET.on('update_game', (data) => {
            this.#latency = Date.now() - this.#prev_update_timestamp;
            this.#prev_update_timestamp = Date.now();

            if(this.#latency < Math.floor(1000 / this.#server_tickrate))
                return;

            this.#latency_text.setText(`Server state latency: ${Math.floor(this.#latency)}ms`);

            this.#server_latency = this.#latency - Math.floor(1000 / this.#server_tickrate);

            if(data.platform1_y)
            {

                if(this.#is_second_player || !this.#prediction[0].checked)
                    this.#platform1_y_server_pos = data.platform1_y;

                if(!this.#is_second_player && this.#prediction[0].checked)
                {
                    if(
                        Object.keys(this.#last_processed_state).length === 0 ||
                        JSON.stringify({ 'state': data.platform1_y, 'tick': data.player1_tick_count }) !== JSON.stringify(this.#last_processed_state)
                    )
                    {
                        this.#last_processed_state = {
                            'state': data.platform1_y, 'tick': data.player1_tick_count
                        }

                        const SERVER_STATE_TICK = data.player1_tick_count % this.#buffer_size;
                        const POSITION_ERROR = Math.abs(this.#state_buffer[SERVER_STATE_TICK] - data.platform1_y);
                        if(POSITION_ERROR > 0.05)
                        {
                            this.#platform1_y_server_pos = data.platform1_y;
                            this.#platform1.setPosition(
                                this.#platform1.x,
                                data.platform1_y
                            );

                            this.#state_buffer[SERVER_STATE_TICK] = data.platform1_y;
                            let TICK_TO_PROCESS = data.player1_tick_count + 1;
                            while(TICK_TO_PROCESS <= this.#user_tick_count)
                            {
                                const BUFFER_INDEX = TICK_TO_PROCESS % this.#buffer_size;

                                if(this.#input_buffer[BUFFER_INDEX] === USER_COMMANDS.UP)
                                {
                                    this.#platform1_y_server_pos = this.#platform1_y_server_pos - (this.#platform_config.velocity[1] * (Math.floor(1 / this.#server_tickrate * 1000) / 1000))
                                    if(this.#platform1_y_server_pos < 50) this.#platform1_y_server_pos = 50;
                                } else if(this.#input_buffer[BUFFER_INDEX] === USER_COMMANDS.DOWN)
                                {
                                    this.#platform1_y_server_pos = this.#platform1_y_server_pos + (this.#platform_config.velocity[1] * (Math.floor(1 / this.#server_tickrate * 1000) / 1000))
                                    if(this.#platform1_y_server_pos > 310) this.#platform1_y_server_pos = 310;
                                }

                                this.#state_buffer[BUFFER_INDEX] = this.#platform1_y_server_pos;
                                TICK_TO_PROCESS++;
                            }
                        }
                    }
                }
            }
            
            if(data.platform2_y)
            {
                if(!this.#is_second_player || !this.#prediction[0].checked)
                    this.#platform2_y_server_pos = data.platform2_y;

                if(this.#is_second_player && this.#prediction[0].checked)
                {
                    if(
                        Object.keys(this.#last_processed_state).length === 0 ||
                        JSON.stringify({ state: data.platform2_y, tick: data.player1_tick_count }) !== JSON.stringify(this.#last_processed_state)
                    )
                    {
                        this.#last_processed_state = {
                            'state': data.platform2_y, 'tick': data.player2_tick_count
                        }

                        const SERVER_STATE_TICK = data.player2_tick_count % this.#buffer_size;
                        const POSITION_ERROR = Math.abs(this.#state_buffer[SERVER_STATE_TICK] - data.platform2_y);
                        
                        if(POSITION_ERROR > 0.05)
                        {
                            this.#platform2_y_server_pos = data.platform2_y;
                            this.#platform2.setPosition(
                                this.#platform2.x,
                                data.platform2_y
                            );

                            this.#state_buffer[SERVER_STATE_TICK] = data.platform2_y;
                            let TICK_TO_PROCESS = data.player2_tick_count + 1;
                            while(TICK_TO_PROCESS <= this.#user_tick_count)
                            {
                                const BUFFER_INDEX = TICK_TO_PROCESS % this.#buffer_size;

                                if(this.#input_buffer[BUFFER_INDEX] === USER_COMMANDS.UP)
                                {
                                    this.#platform2_y_server_pos = this.#platform2_y_server_pos - (this.#platform_config.velocity[1] * (1 / this.#server_tickrate))
                                    if(this.#platform2_y_server_pos < 50) this.#platform2_y_server_pos = 50;
                                } else if(this.#input_buffer[BUFFER_INDEX] === USER_COMMANDS.DOWN)
                                {
                                    this.#platform2_y_server_pos = this.#platform2_y_server_pos + (this.#platform_config.velocity[1] * (1 / this.#server_tickrate))
                                    if(this.#platform2_y_server_pos > 310) this.#platform2_y_server_pos = 310;
                                }

                                this.#state_buffer[BUFFER_INDEX] = this.#platform2_y_server_pos;
                                TICK_TO_PROCESS++;
                            }
                        }
                    }
                }
            }
            
            if(data.ball)
            {
                this.#ball_server_pos = data.ball;
            }
        });

        SOCKET.on('finish_round', (data) => {
            this.#score_text.setText(`${data.player1_wins}:${data.player2_wins}`);
        });

        SOCKET.on('finish_game', (data) => {
            $('.chat-container input').attr("disabled", true);
            
            this.scene.pause();

            if(data.winner_id == user_id)
            {
                POPUP_MANAGER.switchPopupMode(PopupManager.popup_modes.YOU_HAVE_WON);
            } else
            {
                POPUP_MANAGER.switchPopupMode(PopupManager.popup_modes.YOU_HAVE_LOST);
            }

            game_has_ended = true;
            timeout = 0;

            SOCKET.disconnect();
        });

        SOCKET.on('sync', (data) => {
            this.#server_tickrate = data.tickrate;
            this.#lerp_time_factor = 1000 / this.#server_tickrate;
            this.#score_text.setText(`${data.player1_wins}:${data.player2_wins}`);
            
            this.#platform1_y_server_pos = data.platform1_y;
            this.#platform2_y_server_pos = data.platform2_y;
            this.#ball_server_pos = data.ball;
        });

        SOCKET.emit('sync');
    }

    update(time, delta)
    {
        const LERP_CONSTANT = delta / (this.#lerp_time_factor + this.#server_latency);
        
        if(delta <= (this.#lerp_time_factor + this.#server_latency)  && this.#interpolation[0].checked)
        {
            this.#ball.setPosition(
                this.#lerp(this.#ball.x, this.#ball_server_pos[0], LERP_CONSTANT),
                this.#lerp(this.#ball.y, this.#ball_server_pos[1], LERP_CONSTANT)
            );
        } else
        {
            this.#ball.setPosition(this.#ball_server_pos[0], this.#ball_server_pos[1]);
        }

        if(delta <= (this.#lerp_time_factor + (1000 / this.#user_status_tickrate) + this.#server_latency) && this.#interpolation[0].checked)
        {
            if(this.#is_second_player)
            {
                this.#platform1.setPosition(
                    this.#platform1.x,
                    this.#lerp(this.#platform1.y, this.#platform1_y_server_pos, delta / (this.#lerp_time_factor + (1000 / this.#user_status_tickrate) + this.#server_latency))
                );
            } else
            {
                this.#platform2.setPosition(
                    this.#platform2.x,
                    this.#lerp(this.#platform2.y, this.#platform2_y_server_pos, delta / (this.#lerp_time_factor + (1000 / this.#user_status_tickrate) + this.#server_latency))
                );
            }
        } else
        {
            if(this.#is_second_player)
            {
                this.#platform1.setPosition(this.#platform1.x, this.#platform1_y_server_pos);
            } else
            {
                this.#platform2.setPosition(this.#platform2.x, this.#platform2_y_server_pos);
            }
        }

        if (delta <= ((1000 / this.#user_status_tickrate)) && this.#reconciliation[0].checked)
        {
            if(!this.#is_second_player)
            {
                this.#platform1.setPosition(
                    this.#platform1.x,
                    this.#lerp(this.#platform1.y, this.#platform1_y_server_pos, delta / ((1000 / this.#user_status_tickrate)))
                );
            } else
            {
                this.#platform2.setPosition(
                    this.#platform2.x,
                    this.#lerp(this.#platform2.y, this.#platform2_y_server_pos, delta / ((1000 / this.#user_status_tickrate)))
                );
            }
        } else
        {
            if(!this.#is_second_player)
            {
                this.#platform1.setPosition(this.#platform1.x, this.#platform1_y_server_pos);
            } else
            {
                this.#platform2.setPosition(this.#platform2.x, this.#platform2_y_server_pos);
            }
        }
    
        this.#fps_text.setText(`FPS: ${Math.floor(1000 / delta)}`);
    }

    #lerp(start, end, time) {
        return start * (1 - time) + end * time;
    }
}

const FRAME_RATE = 60;
const CONFIG = {
    type: Phaser.AUTO,
    scale: {
        mode: Phaser.Scale.FIT,
        parent: 'playground',
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 640,
        height: 360  
    },
    physics: {
        default: 'arcade',
        arcade: {
            debug: false
        }
    },
    fps: {
        forceSetTimeOut: true,
        target: FRAME_RATE
    },
    backgroundColor: '#4488AA',
    resolution: window.devicePixelRatio
};

const GAME = new Phaser.Game(CONFIG);
GAME.scene.add('MainScene', Scene);

const SOCKET = socketBase('/pong');

const POPUP_MANAGER = new PopupManager();
POPUP_MANAGER.switchPopupMode(PopupManager.popup_modes.WAITING_FOR_JOIN);

let user_id = 'x', username = '', room_id = '', timeout = 999, delta_time = Date.now(), remaining_time, is_second_player;
let game_has_started = false, game_has_ended = false;

SOCKET.on('setup', (data, callback) => {
    if(!data)
        window.location.reload();

    user_id = data.user_id;
    username = data.username;
    room_id = data.room_id;
    timeout = data.timeout;
    delta_time = Date.now();
    game_has_started = data.is_game_started;
    is_second_player = data.is_second_player;

    if(data.player_is_ready && !game_has_started)
    {
        POPUP_MANAGER.switchPopupMode(PopupManager.popup_modes.WAITING_FOR_START);
    } else if(data.has_second_player_joined && !game_has_started)
    {
        POPUP_MANAGER.switchPopupMode(PopupManager.popup_modes.START_GAME);
    } else
    {
        if(game_has_started)
        {
            POPUP_MANAGER.switchPopupMode(PopupManager.popup_modes.HIDDEN);
            GAME.scene.start('MainScene', {
                is_second_player
            });
        }
    }

    if(localStorage.getItem('room_id') === room_id)
    {
        setChat();
    } else
    {
        localStorage.clear();
        localStorage.setItem('room_id', room_id);
    }

    callback(true);
});

SOCKET.on('message', (data) => {
    onMessage(data, user_id);
});

SOCKET.on('update_time', (data) => {
    timeout = data.timeout;
    delta_time = Date.now();
});

SOCKET.on('update', (data) => {
    timeout = data.timeout;
    delta_time = Date.now();

    POPUP_MANAGER.switchPopupMode(PopupManager.popup_modes.START_GAME);
});

SOCKET.on('terminate_client', (data) => {
    $('.chat-container input').attr("disabled", true);

    if(data.user_id === user_id)
    {
        POPUP_MANAGER.switchPopupMode(PopupManager.popup_modes.YOU_HAVE_LOST);
    } else
    {
        POPUP_MANAGER.switchPopupMode(PopupManager.popup_modes.YOU_HAVE_WON);
    }

    game_has_started = game_has_ended = true;
    timeout = 0;

    GAME.scene.pause('MainScene');

    SOCKET.disconnect();
});

SOCKET.on('start_game', (data) => {
    POPUP_MANAGER.switchPopupMode(PopupManager.popup_modes.HIDDEN);

    game_has_started = true;

    GAME.scene.start('MainScene', {
        is_second_player
    });
});

$('.leave-button').click(() => {
    SOCKET.emit('termination');
});

remaining_time = timeout - ((Date.now() - delta_time) / 1000);
$('.timeout-counter').text(Math.ceil(remaining_time));
const interval = setInterval(() => {
    remaining_time = timeout - ((Date.now() - delta_time) / 1000);
    if(remaining_time <= 0)
    {
        clearInterval(interval);
        if(!game_has_started)
            window.location.reload();
        else if(!game_has_ended)
        {
            POPUP_MANAGER.switchPopupMode(PopupManager.popup_modes.DRAW);
            GAME.scene.pause('MainScene');
        }

        $('.timeout-counter').text(0);
    } else
    {
        $('.timeout-counter').text(Math.ceil(remaining_time));
    }
}, 1000);

$('#chat-form').submit(() => {
    const value = $('#chat-input').val();
    $('#chat-input').val('');

    const payload = {
        'message': value
    }

    SOCKET.send(payload);

    return false;
});

$('#game-popup-button-start').click((e) => {
    SOCKET.emit('start');
    POPUP_MANAGER.switchPopupMode(PopupManager.popup_modes.WAITING_FOR_START);
});