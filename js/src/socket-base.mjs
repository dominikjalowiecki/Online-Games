import { io } from './socket.io.esm.min.js';

export class PopupManager
{
    static exists = false;
    static instance = null;

    #popup;
    #popup_value;
    #game_popup_button;
    #custom_text;

    static popup_modes = {
        WAITING_FOR_JOIN: 0,
        START_GAME: 1,
        WAITING_FOR_START: 2,
        YOU_HAVE_WON: 3,
        YOU_HAVE_LOST: 4,
        HIDDEN: 5,
        DRAW: 6,
        CUSTOM_TEXT: 7,
        YOUR_TURN: 8,
        ROUND_DRAW: 9,
        YOU_HAVE_WON_ROUND: 10,
        YOU_HAVE_LOST_ROUND: 11,
        GAME_HAS_ENDED: 12
    }

    constructor()
    {
        if(PopupManager.exists)
        {
            return PopupManager.instance;
        }

        this.#popup = $('#game-popup');
        this.#popup_value = $('#game-popup-value');
        this.#game_popup_button = $('#game-popup-button-start');
        this.#custom_text = '';

        PopupManager.exists = true;
        PopupManager.instance = this;

        return this;
    }

    set popupCustomText(text)
    {
        this.#custom_text = text;
    }

    hidePopup()
    {
        this.#popup.css('visibility', 'hidden');
    }

    #setupPopupWithButton(value)
    {
        this.#popup_value.text(value);
        this.#game_popup_button.css('display', 'inline-block');
        this.#popup.css('visibility', 'visible');
    }

    #setupPopupWithoutButton(value)
    {
        this.#popup_value.text(value);
        this.#game_popup_button.css('display', 'none');
        this.#popup.css('visibility', 'visible');
    }

    switchPopupMode(mode)
    {
        switch(mode)
        {
            case PopupManager.popup_modes.WAITING_FOR_JOIN:
                this.#setupPopupWithoutButton('Waiting for other player to join...');
                break;
            case PopupManager.popup_modes.START_GAME:
                this.#setupPopupWithButton('Click to start the game.');
                break;
            case PopupManager.popup_modes.WAITING_FOR_START:
                this.#setupPopupWithoutButton('Waiting for other player to start...');
                break;
            case PopupManager.popup_modes.YOU_HAVE_WON:
                this.#setupPopupWithoutButton('You have won!');
                break;
            case PopupManager.popup_modes.YOU_HAVE_LOST:
                this.#setupPopupWithoutButton('You have lost...');
                break;
            case PopupManager.popup_modes.HIDDEN:
                this.#popup.css('visibility', 'hidden');
                break;
            case PopupManager.popup_modes.DRAW:
                this.#setupPopupWithoutButton('Game draw...');
                break;
            case PopupManager.popup_modes.CUSTOM_TEXT:
                this.#setupPopupWithoutButton(this.#custom_text);
                break;
            case PopupManager.popup_modes.YOUR_TURN:
                this.#setupPopupWithoutButton('Your turn!');
                break;
            case PopupManager.popup_modes.ROUND_DRAW:
                this.#setupPopupWithoutButton('Round draw.');
                break;
            case PopupManager.popup_modes.YOU_HAVE_WON_ROUND:
                this.#setupPopupWithoutButton('You have won round!');
                break;
            case PopupManager.popup_modes.YOU_HAVE_LOST_ROUND:
                this.#setupPopupWithoutButton('You have lost round.');
                break;
            case PopupManager.popup_modes.GAME_HAS_ENDED:
                this.#setupPopupWithoutButton('The game has ended.');
                break;
        }
    }
}

export function onMessage(data, user_id='x')
{
    if(localStorage.getItem('chat') === null)
    {
        localStorage.setItem('chat', JSON.stringify({
            "messages" : []
        }));
    }
    let chat = localStorage.getItem('chat');

    let obj = JSON.parse(chat);
    const message = '<div class="chat-message-container' + (user_id == data[0] ? ' own-message' : '') + '">' + '<p class="chat-message' + (data[1] === '' ? ' server-message' : '') + ' ">' + (data[1] + ': ' + data[2] + '<br><small>' + data[3]) + '</small>' +'</p>' + '</div>';
    obj.messages.push(message);

    localStorage.setItem('chat', JSON.stringify(obj));
    
    const chat_container = $('#chat');
    chat_container.append(message);
    chat_container.prop('scrollTop', chat_container.prop('scrollHeight'));
}

export function setChat()
{
    let chat;
    if((chat = localStorage.getItem('chat')) !== null)
    {
        const obj = JSON.parse(chat);
        const chat_container = $('#chat');
        $.each(obj.messages, (idx, val) => {
            chat_container.append(val);
        });
        chat_container.prop('scrollTop', chat_container.prop('scrollHeight'));
    }
}

export function socketBase(namespace)
{
    const socket = io(namespace, { transports: ["websocket"] });

    socket.on('refresh', () => {
        window.location.reload();
    });

    socket.on("connect_error", (error) => {
        console.error(`>> Connection error: ${error.message}`);
    });

    return socket;
}