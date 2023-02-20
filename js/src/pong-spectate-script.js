import {socketBase, onMessage, setChat, PopupManager} from './socket-base.mjs';

class Scene extends Phaser.Scene
{
    #width;
    #height;
    #primary_color;
    #platform_config;
    #ball_config;
    #platform1;
    #platform2;
    #ball;

    #user_status_tickrate;
    #server_tickrate = 40; // Tickrate of server
    #lerp_time_factor = 1;
    #platform1_y_server_pos;
    #platform2_y_server_pos;
    #ball_server_pos;

    #score_text;
    #latency_text;
    #fps_text;

    #latency = 0;
    #server_state_latency = 0;

    #prev_update_timestamp = Date.now();

    #interpolation;

    constructor(config)
    {
        super(config);
    }

    init(data)
    {
        this.#interpolation = $('#interpolation');

        this.#width = this.sys.game.config.width;
        this.#height = this.sys.game.config.height;
        this.#primary_color = 0x000;

        this.#user_status_tickrate = 30;

        this.#platform_config = {
            width: 20,
            height: 100,
            margin: 45
        };

        this.#ball_config = {
            radius: 10
        };
    }

    preload()
    {
        this.load.bitmapFont('my_font', 'static/fonts/bitmapFonts/my_font.png', 'static/fonts/bitmapFonts/my_font.fnt');
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

        this.#ball = this.add.circle(
            (this.#width / 2),
            (this.#height / 2),
            this.#ball_config.radius,
            this.#primary_color
        );
        this.#ball_server_pos = [this.#ball.x, this.#ball.y];

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
        
        SOCKET.on('update_game', (data) => {
            this.#latency = Date.now() - this.#prev_update_timestamp;
            this.#prev_update_timestamp = Date.now();

            this.#server_state_latency = this.#latency - (Math.floor(1000/this.#server_tickrate))

            this.#latency_text.setText(`Server state latency: ${Math.floor(this.#latency)}ms`);
            
            if(data.platform1_y)
            {
                this.#platform1_y_server_pos = data.platform1_y;
            }
            
            if(data.platform2_y)
            {
                this.#platform2_y_server_pos = data.platform2_y;
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
            this.scene.pause();

            POPUP_MANAGER.popupCustomText = data.winner_nick + ' has won the game.';
            POPUP_MANAGER.switchPopupMode(PopupManager.popup_modes.CUSTOM_TEXT);

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
        const LERP_CONSTANT = delta / (this.#lerp_time_factor + this.#server_state_latency);
        
        if(delta <= (this.#lerp_time_factor + this.#server_state_latency) && this.#interpolation[0].checked)
        {
            this.#ball.setPosition(
                this.#lerp(this.#ball.x, this.#ball_server_pos[0], LERP_CONSTANT),
                this.#lerp(this.#ball.y, this.#ball_server_pos[1], LERP_CONSTANT)
            );
        } else
        {
            this.#ball.setPosition(this.#ball_server_pos[0], this.#ball_server_pos[1]);
        }

        if(delta <= (this.#lerp_time_factor + (1000 / this.#user_status_tickrate) + this.#server_state_latency) && this.#interpolation[0].checked)
        {
            this.#platform1.setPosition(
                this.#platform1.x,
                this.#lerp(this.#platform1.y, this.#platform1_y_server_pos, delta / (this.#lerp_time_factor + (1000 / this.#user_status_tickrate) + this.#server_state_latency))
            );

            this.#platform2.setPosition(
                this.#platform2.x,
                this.#lerp(this.#platform2.y, this.#platform2_y_server_pos, delta / (this.#lerp_time_factor + (1000 / this.#user_status_tickrate) + this.#server_state_latency))
            );
        } else
        {
            this.#platform1.setPosition(this.#platform1.x, this.#platform1_y_server_pos);
            this.#platform2.setPosition(this.#platform2.x, this.#platform2_y_server_pos);
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

let room_id = '', timeout = 999, delta_time = Date.now(), remaining_time;
let game_has_started = false, game_has_ended = false;

SOCKET.on('setup', (data) => {
    if(!data)
        window.location.reload();

    room_id = data.room_id;
    timeout = data.timeout;
    delta_time = Date.now();
    game_has_started = data.is_game_started;

    if(!game_has_started)
    {
        POPUP_MANAGER.switchPopupMode(PopupManager.popup_modes.WAITING_FOR_START);
    } else
    {
        POPUP_MANAGER.switchPopupMode(PopupManager.popup_modes.HIDDEN);
        GAME.scene.start('MainScene');
    }

    if(localStorage.getItem('room_id') === room_id)
    {
        setChat();
    } else
    {
        localStorage.clear();
        localStorage.setItem('room_id', room_id);
    }
});

SOCKET.on('message', (data) => {
    onMessage(data);
});

SOCKET.on('update_time', (data) => {
    timeout = data.timeout;
    delta_time = Date.now();
});

SOCKET.on('update', (data) => {
    timeout = data.timeout;
    delta_time = Date.now();
});

SOCKET.on('terminate_client', (data) => {
    $('.chat-container input').attr("disabled", true);

    POPUP_MANAGER.switchPopupMode(PopupManager.popup_modes.GAME_HAS_ENDED);

    game_has_started = game_has_ended = true;
    timeout = 0;

    GAME.scene.pause('MainScene');

    SOCKET.disconnect();
});

SOCKET.on('start_game', (data) => {
    POPUP_MANAGER.switchPopupMode(PopupManager.popup_modes.HIDDEN);

    game_has_started = true;

    GAME.scene.start('MainScene');
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
        if(!game_has_ended)
        {
            POPUP_MANAGER.switchPopupMode(PopupManager.popup_modes.DRAW);
            GAME.scene.pause('MainScene');
        }

        $('.timeout-counter').text(0);
        const timeout = setTimeout(() => {
            window.location.reload();
        }, 5000);
    } else
    {
        $('.timeout-counter').text(Math.ceil(remaining_time));
    }
}, 1000);