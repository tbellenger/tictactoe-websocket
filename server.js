require('dotenv').config();
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const mongodb = require('mongodb');
const ws = require('ws');
const EventEmitter = require('events');
const MongoClient = mongodb.MongoClient;
const ObjectID = mongodb.ObjectId;

const uri = process.env.DB_SERVER_URI;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

async function initDb() {
  try {
    await client.connect();

    await client.db("map").command({ping: 1});
    console.log("Connected successfully to database");
  } catch (err) {
    console.log(err);
  }
}

initDb();

async function dbInsertUser(object) {
  try {
    await client.connect();
    await client.db("map").collection("users").insertOne(object);
  } catch (err) {
    console.log(err);
  }
}

async function dbUpdateUser(id, newUsername) {
  try {
    await client.connect();
    const query = {_id: new ObjectID(id)};
    const newVal = { $set: {username : newUsername }};
    await client.db("map").collection("users").updateOne(query, newVal);
  } catch (err) {
    console.log(err);
  }
}

async function dbGetAllUsers() {
  try {
    await client.connect();
    return await client.db("map").collection("users").find().toArray();
  } catch (err) {
    console.log(err);
  }
}

async function dbGetUser(id) {
  try {
    await client.connect();
    const query = { _id: new ObjectID(id) };
    return await client.db("map").collection("users").find(query).toArray();
  } catch (err) {
    console.log(err);
  }
}

async function dbDeleteUser(id) {
  try {
    await client.connect();
    const query = { _id: new ObjectID(id) };
    await client.db("map").collection("users").deleteOne(query);
  } catch (err) {
    console.log(err);
  }
}

const waitingPlayers = [];

const app = express();
app.set('port', (process.env.PORT || 5000));
app.use(express.static(__dirname + '/public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// headless websocket server prints to console
const wsServer = new ws.Server({noServer: true});
wsServer.on('connection', socket => {
  const player = new Player(socket);
  player.on('restart', (player) => {waitingPlayers.push(player)});
  waitingPlayers.push(player);
});

class Player extends EventEmitter {
  constructor(socket, id = uuidv4()) {
    super();
    this.socket = socket;
    this.id = id;
    this.token = '';
    this.isClosed = false;
    this.lastData;
    this.socket.on('close', () => {
      this.isClosed = true;
      this.emit('quit', 'Closed connection');
    });
    this.socket.on('message', (json) => {
      // if this is a new game request then put back in waiting array
      this.lastData = JSON.parse(json);
      if (this.lastData.message) {
        if (this.lastData.message == 'restart') {
          this.emit('restart', this);
        }
      } else {
        this.emit('player-message', this);
      }
    });
    this.sendMessage({status:'wait', data: 'Waiting for another player'});
  }

  sendMessage(data) {
    if (!this.isClosed) {
      data.token = this.token;
      data.uuid = this.id;
      this.socket.send(JSON.stringify({message:data}));
    }
  }
}

class Game extends EventEmitter {
  constructor(player1, player2) {
    super();
    this.player1 = player1;
    this.player2 = player2;
    this.board = ['','','','','','','','',''];
    this.id = uuidv4();
    // 0 = new game
    // 1 = in progress
    // 2 = player quit
    // 3 = winner
    // 4 = game over 
    this.state = 0;
    this.turn = this.player1.id;
    this.winner = '';
    this.player1.on('quit', () => {this.state = 2; this.updatePlayers()});
    this.player2.on('quit', () => {this.state = 2; this.updatePlayers()});
    this.player1.on('player-message', (player) => {
      this.incomingMessage(player);
    });
    this.player2.on('player-message', (player) => {
      this.incomingMessage(player);
    });
    this.player1.token = 'O';
    this.player2.token = 'X';

    this.updatePlayers();
  }

  incomingMessage(player) {
    if (this.state != 4) {
      // check if this players turn
      if (player.id == this.turn) {
        // update board
        if (this.board[player.lastData.boardIndex] != '') { return; }
        this.board[player.lastData.boardIndex] = player.token;
        // update whos turn it is
        this.turn = this.player1.id == player.id ? this.player2.id : this.player1.id;
        // check for win
        if (this.isWinner(player)) {
          this.winner = player.id;
          this.state = 3;
        } else if (this.board.every(element => { return element != ''})) {
          this.winner = "draw";
          this.state = 3;
        }
        // Update players
        this.updatePlayers();
      } else {
        // ignore ? 
      }
    }
  }

  updatePlayers() {
    let data;
    switch (this.state) {
      case 0:
        data = {status: 'ok', data:'New Game', board:this.board, turn:this.turn};
        this.state = 1;
        break;
      case 1:
        data = {status: 'ok', data:'Update', board:this.board, turn:this.turn};
        break;
      case 2: 
        data = {status: 'err', data:'Other player quit'};
        break;
      case 3:
        data = {status: 'ok', data:'Game Over', board:this.board, winner:this.winner};
        this.state = 4;
        break;
    }

    this.player1.sendMessage(data);
    this.player2.sendMessage(data);
  }

  isWinner = (player) => {
    return Game.WINNING_COMBINATIONS.some(combination =>{
      return combination.every(index => {
        return this.board[index] == player.token;
      });
    });
  }
}

Object.defineProperty(Game, 'WINNING_COMBINATIONS', {
  value: [
    [0,1,2],
    [3,4,5],
    [6,7,8],
    [0,3,6],
    [1,4,7],
    [2,5,8],
    [0,4,8],
    [2,4,6],
  ],
  writable: false,
  enumerable: false,
  configurable: false
});

const checkWaitingPlayers = () => {
  if (waitingPlayers.length >= 2) {
    const p1 = waitingPlayers.pop();
    const p2 = waitingPlayers.pop();
    new Game(p1, p2);
  }
}

setInterval(checkWaitingPlayers, 1000);

app.get('/users', async (req, res) => {
  try {
    const users = await dbGetAllUsers();
    return res.json(users);
  } catch (err) {
    return res.status(500).json({message : err.message});
  }
})

app.get('/users/:userId', async (req, res) => {
  try {
    const user = await dbGetUser(req.params.userId);
    return res.json({message: user});
  } catch (err) {
    return res.status(500).json({message: err.message});
  }
})

app.post('/users', async (req, res) => {
    try {
      const user = {username: req.body.username}
      await dbInsertUser(user);
      return res.status(201).json({message : 'success'});
    } catch (err) {
      return res.status(400).json({message : err.message});
    }
})

app.put('/users/:userId', async (req, res) => {
    await dbUpdateUser(req.params.userId, req.body.username);
    return res.send('Received PUT request');
})

app.delete('/users/:userId', async (req, res) => {
    await dbDeleteUser(req.params.userId);
    return res.send('Received DELETE request');
})

const server = app.listen(app.get('port'), () => {
    console.log("Node app is running at localhost:" + app.get('port'));
});
server.on('upgrade', (req, socket, head) => {
  console.log('upgrade request received');
  wsServer.handleUpgrade(req, socket, head, socket => {
    wsServer.emit('connection', socket, req);
  });
});
