import {socketBase, setChat, onMessage, PopupManager} from './socket-base.mjs';

const socket = socketBase('/tic-tac-toe');
const POPUP_MANAGER = new PopupManager();
POPUP_MANAGER.switchPopupMode(PopupManager.popup_modes.WAITING_FOR_JOIN);

function tttswitchPopupMode(popup_manager, mode)
{
    popup_manager.switchPopupMode(mode);
    $('#tic-tac-toe-game').addClass('disabled');
}

function ttthidePopup(popup_manager)
{
    popup_manager.hidePopup();
    $('#tic-tac-toe-game').removeClass('disabled');
}

let user_id = 'x', username = '', room_id = '', timeout = 999, is_your_turn = false, delta_time = Date.now(), remaining_time;
let matrix, if_send_timeout = false;
let game_has_started = false, game_has_ended = false;

socket.on('setup', (data, callback) => {
    if(!data)
        window.location.reload();
    
    user_id = data.user_id;
    username = data.username;
    room_id = data.room_id;
    timeout = data.timeout;
    delta_time = Date.now();
    game_has_started = data.is_game_started;
    is_your_turn = (user_id === data.player_turn_id);

    matrix = data.matrix;
    $('#tic-tac-toe-game').children().each((idx, el) => {
        el.querySelector('span').textContent = matrix[el.dataset.row][el.dataset.col];
    });

    if(data.player_is_ready && !game_has_started)
    {
        tttswitchPopupMode(POPUP_MANAGER, PopupManager.popup_modes.WAITING_FOR_START);
    } else if(data.has_second_player_joined && !game_has_started)
    {
        tttswitchPopupMode(POPUP_MANAGER, PopupManager.popup_modes.START_GAME);
    } else
    {
        if(user_id === data.player_turn_id)
        {
            tttswitchPopupMode(POPUP_MANAGER, PopupManager.popup_modes.YOUR_TURN);
            ttthidePopup(POPUP_MANAGER);
        } else if(data.player_turn_id !== '')
        {
            POPUP_MANAGER.popupCustomText = data.player_turn_username + ' turn.';
            tttswitchPopupMode(POPUP_MANAGER, PopupManager.popup_modes.CUSTOM_TEXT);
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

socket.on('message', (data) => {
    onMessage(data, user_id);
});

socket.on('update', (data) => {
    timeout = data.timeout;
    delta_time = Date.now();

    tttswitchPopupMode(POPUP_MANAGER, PopupManager.popup_modes.START_GAME);
});

function update_game(data)
{
    timeout = data.timeout;
    delta_time = Date.now();

    matrix = data.matrix;
    $('#tic-tac-toe-game').children().each((idx, el) => {
        el.querySelector('span').textContent = matrix[el.dataset.row][el.dataset.col];
    });

    if(data.player_turn_id === user_id)
    {
        tttswitchPopupMode(POPUP_MANAGER, PopupManager.popup_modes.YOUR_TURN);
        ttthidePopup(POPUP_MANAGER);
    } else
    {
        POPUP_MANAGER.popupCustomText = data.player_turn_username + ' turn.';
        tttswitchPopupMode(POPUP_MANAGER, PopupManager.popup_modes.CUSTOM_TEXT);
    }

    socket.emit('update_game');
}

socket.on('update_game', (data) => {
    if(!game_has_started) game_has_started = true;
    
    update_game(data);
});

socket.on('finish_round', (data) => {
    timeout = data.timeout;
    delta_time = Date.now();

    $('#tic-tac-toe-game').children().each((idx, el) => {
        el.querySelector('span').textContent = data.winning_matrix[el.dataset.row][el.dataset.col];
    });

    if(data.is_draw)
    {
        tttswitchPopupMode(POPUP_MANAGER, PopupManager.popup_modes.ROUND_DRAW);
    } else
    {
        data.winning_fields.forEach(el => {
            $('.tic-tac-toe-field').eq((el[0]*3)+(el[1])).addClass('winning-field');
        });

        if(data.player_id === user_id)
        {
            tttswitchPopupMode(POPUP_MANAGER, PopupManager.popup_modes.YOU_HAVE_WON_ROUND);
        } else
        {
            tttswitchPopupMode(POPUP_MANAGER, PopupManager.popup_modes.YOU_HAVE_LOST_ROUND);
        }
    }

    const update_timeout = setTimeout(() => {
        if(!game_has_ended)
        {
            $('#tic-tac-toe-game').children().each((idx, el) => {
                el.classList.remove('winning-field');
            });

            update_game(data);
        }
    }, 2000);
});

socket.on('finish_game', (data) => {
    $('.chat-container input').attr("disabled", true);

    $('#tic-tac-toe-game').children().each((idx, el) => {
        el.querySelector('span').textContent = data.matrix[el.dataset.row][el.dataset.col];
    });

    if(data.is_draw)
    {
        tttswitchPopupMode(POPUP_MANAGER, PopupManager.popup_modes.DRAW);
    } else
    {
        if(data.winning_fields[0] !== null)
        {
            data.winning_fields.forEach(el => {
                $('.tic-tac-toe-field').eq((el[0]*3)+(el[1])).addClass('winning-field');
            });
        }

        if(data.player_id === user_id)
        {
            tttswitchPopupMode(POPUP_MANAGER, PopupManager.popup_modes.YOU_HAVE_WON);
        } else
        {
            tttswitchPopupMode(POPUP_MANAGER, PopupManager.popup_modes.YOU_HAVE_LOST);
        }
    }

    game_has_ended = true;
    timeout = 0;
    socket.disconnect();
});

socket.on('move', () => {
    is_your_turn = true;
});

socket.on('terminate_client', (data) => {
    $('.chat-container input').attr("disabled", true);

    if(data.user_id === user_id)
    {
        tttswitchPopupMode(POPUP_MANAGER, PopupManager.popup_modes.YOU_HAVE_LOST);
    } else
    {
        tttswitchPopupMode(POPUP_MANAGER, PopupManager.popup_modes.YOU_HAVE_WON);
    }

    game_has_started = game_has_ended = true;
    timeout = 0;
    socket.disconnect();
});

socket.on('timeout_response', (callback) =>
{
    callback(if_send_timeout);
});

$('.leave-button').click(() => {
    socket.emit('termination');
});

remaining_time = timeout - ((Date.now() - delta_time) / 1000);
$('.timeout-counter').text(Math.ceil(remaining_time));
const interval = setInterval(() => {
    remaining_time = timeout - ((Date.now() - delta_time) / 1000);
    if(remaining_time <= 0)
    {
        clearInterval(interval);
        if(!game_has_started)
        {
            window.location.reload();
        } else if(!game_has_ended)
        {
            socket.emit('move_timeout');
            if_send_timeout = true;
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

    socket.send(payload);

    return false;
});

$('#game-popup-button-start').click((e) => {
    socket.emit('start');
    tttswitchPopupMode(POPUP_MANAGER, PopupManager.popup_modes.WAITING_FOR_START);
});

$('#tic-tac-toe-game').click((e) => {
    if(is_your_turn && e.target.classList.contains('tic-tac-toe-field'))
    {
        let row = e.target.dataset.row;
        let col = e.target.dataset.col;
        if(matrix[row][col] === '')
        {
            is_your_turn = false;
            socket.emit('move', {
                'row': e.target.dataset.row,
                'col': e.target.dataset.col
            });
        }
    }
});