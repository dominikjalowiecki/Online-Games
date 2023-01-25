import {socketBase, setChat, onMessage, PopupManager} from './socket-base.mjs';

const socket = socketBase('/tic-tac-toe');
const POPUP_MANAGER = new PopupManager();
POPUP_MANAGER.switchPopupMode(PopupManager.popup_modes.WAITING_FOR_JOIN);

let room_id = '', timeout = 999, delta_time = Date.now(), remaining_time;
let matrix;
let game_has_ended = false, is_game_started = false;

socket.on('setup', (data) => {
    if(!data)
        window.location.reload();

    room_id = data.room_id;
    timeout = data.timeout;
    is_game_started = data.is_game_started;
    delta_time = Date.now()

    if(is_game_started)
    {
        
        POPUP_MANAGER.popupCustomText = `Waiting for ${data.player_turn_username} move.`;
        POPUP_MANAGER.switchPopupMode(PopupManager.popup_modes.CUSTOM_TEXT);
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

socket.on('message', (data) => {
    onMessage(data);
});

socket.on('update', (data) => {
    timeout = data.timeout;
    delta_time = Date.now()
});

function update_game(data)
{
    timeout = data.timeout;
    delta_time = Date.now()

    matrix = data.matrix;
    $('#tic-tac-toe-game').children().each((idx, el) => {
        el.querySelector('span').textContent = matrix[el.dataset.row][el.dataset.col];
    });

    POPUP_MANAGER.popupCustomText = data.player_turn_username + ' turn.';
    POPUP_MANAGER.switchPopupMode(PopupManager.popup_modes.CUSTOM_TEXT);
}

socket.on('update_game', update_game);

socket.on('finish_round', (data) => {
    timeout = data.timeout;
    delta_time = Date.now()

    $('#tic-tac-toe-game').children().each((idx, el) => {
        el.querySelector('span').textContent = data.winning_matrix[el.dataset.row][el.dataset.col];
    });

    if(data.is_draw)
    {
        POPUP_MANAGER.switchPopupMode(PopupManager.popup_modes.ROUND_DRAW);

    } else
    {
        data.winning_fields.forEach(el => {
            $('.tic-tac-toe-field').eq((el[0]*3)+(el[1])).addClass('winning-field');
        });

        POPUP_MANAGER.popupCustomText = data.player_username + ' has won the round.';
        POPUP_MANAGER.switchPopupMode(PopupManager.popup_modes.CUSTOM_TEXT);
    }

    const timemout = setTimeout(() => {
        $('#tic-tac-toe-game').children().each((idx, el) => {
            el.classList.remove('winning-field');
        });

        update_game(data);
    }, 2000);
});

socket.on('finish_game', (data) => {
    $('#tic-tac-toe-game').children().each((idx, el) => {
        el.querySelector('span').textContent = data.matrix[el.dataset.row][el.dataset.col];
    });

    if(data.is_draw)
    {
        POPUP_MANAGER.switchPopupMode(PopupManager.popup_modes.DRAW);
    } else
    {
        if(data.winning_fields)
        {
            data.winning_fields.forEach(el => {
                $('.tic-tac-toe-field').eq((el[0]*3)+(el[1])).addClass('winning-field');
            });
        }

        POPUP_MANAGER.popupCustomText = data.player_username + ' has won the game.';
        POPUP_MANAGER.switchPopupMode(PopupManager.popup_modes.CUSTOM_TEXT);
    }
    
    game_has_ended = true;
    timeout = 0;
    socket.disconnect();
});

socket.on('terminate_client', (data) => {
    timeout = 0;
    socket.disconnect();
});




remaining_time = timeout - ((Date.now() - delta_time) / 1000);
$('.timeout-counter').text(Math.ceil(remaining_time));
const interval = setInterval(() => {
    remaining_time = timeout - ((Date.now() - delta_time) / 1000);
    if(remaining_time <= 0)
    {
        clearInterval(interval);
        if(!game_has_ended)
            POPUP_MANAGER.switchPopupMode(PopupManager.popup_modes.GAME_HAS_ENDED);
        
        $('.timeout-counter').text(0);
        const timeout = setTimeout(() => {
            window.location.reload();
        }, 5000);
    } else
    {
        $('.timeout-counter').text(Math.ceil(remaining_time));
    }
}, 1000);