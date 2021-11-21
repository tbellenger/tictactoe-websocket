const proto = (window.location.protocol == "https:") ? "wss://":"ws://";
//const port = (window.location.port != '') ? ':' + window.location.port : '';
const ws = new WebSocket(proto +  window.location.hostname);
let clientId;
let lastMsg;

document.querySelector('#board').addEventListener('click', function(event) {
    console.log(event.target.dataset.cell);
    if (clientId == lastMsg.state && event.target.innerHTML == '') {
        let clientMsg = {
            state: lastMsg.state,
            boardIndex: event.target.dataset.cell,
            id: lastMsg.id
        }
        ws.send(JSON.stringify(clientMsg));
    }
});

// Join the server
ws.onopen = function () {
    ws.send(JSON.stringify({ message: 'join' }));
    // add listener for incoming 
    document.querySelector('#send').addEventListener('click', function () {
        let boardIndex = document.querySelector('#message').value;
        let clientMsg = {
            state: lastMsg.state,
            boardIndex,
            id: lastMsg.id
        }
        ws.send(JSON.stringify(clientMsg));
    });
};

ws.onmessage = function (response) {
    lastMsg = JSON.parse(response.data);
    if (lastMsg.message) {
        if (lastMsg.message.winner) {
            if (clientId == winner) {
                alert('you won');
            } else {
                alert('you lost');
            }
        } else {
            clientId = lastMsg.message.uuid;
        }
    } else {
        console.log(lastMsg.state);
        console.log(clientId);
        const cells = document.querySelectorAll('.cell');
        cells.forEach((cell) => {
            cell.innerHTML = lastMsg.board[cell.dataset.cell]
        });
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