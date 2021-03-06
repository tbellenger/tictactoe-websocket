const proto = (window.location.protocol == "https:") ? "wss://":"ws://";
//const port = (window.location.port != '') ? ':' + window.location.port : '';
const ws = new WebSocket(proto +  window.location.hostname);
let clientId;
let lastMsg;

document.querySelector('#board').addEventListener('click', function(event) {
    if (clientId == lastMsg.message.turn && event.target.innerHTML == '') {
        let clientMsg = {
            boardIndex: event.target.dataset.cell
        }
        ws.send(JSON.stringify(clientMsg));
    }
});

document.querySelector('#restart').addEventListener('click', function(event) {
    ws.send(JSON.stringify({message:'restart'}));
    document.querySelector('#end-game').classList.toggle("show");
    document.querySelector('#waiting').classList.add("show");
});

ws.onmessage = function (response) {
    lastMsg = JSON.parse(response.data);
    if (lastMsg.message) {
        if (lastMsg.message.status == 'ok') {
            document.querySelector('#waiting').classList.remove("show");
            clientId = lastMsg.message.uuid;
            document.querySelector('#turn').innerHTML = (clientId == lastMsg.message.turn) ? "Your turn" : "Their turn";
            const cells = document.querySelectorAll('.cell');
            cells.forEach((cell) => {
                cell.innerHTML = lastMsg.message.board[cell.dataset.cell]
            });
            if (lastMsg.message.winner) {
                if (clientId == lastMsg.message.winner) {
                    console.log('you won');
                    endGame("You Won!");
                } else if (lastMsg.message.winner == 'draw') {
                    console.log('draw');
                    endGame("A Draw!");
                } else {
                    console.log('you lost');
                    endGame("You Lost!");
                }
            }
        } else if (lastMsg.message.status == 'wait') {
            document.querySelector('#waiting').classList.add("show");
        } else {
            console.log(lastMsg.message.data);
        }
    } 
    document.querySelector('#messages').innerHTML += `<div>${JSON.stringify(response.data)}</div>`;
};

ws.onclose = function (event) {
    if (event.wasClean) {
        console.log('connection closed cleanly');
    } else {
        console.log('connection failed');
    }
}

ws.onerror = function (error) {
    console.log(error.message);
}

function endGame(message) {
    document.querySelector('#msg').innerHTML = message;
    document.querySelector('#end-game').classList.toggle("show");
}