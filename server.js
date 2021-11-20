//import 'dotenv/config.js';
require('dotenv').config();
//import express from 'express';
const express = require('express');
//import * as mongodb from 'mongodb';
const { v4: uuidv4 } = require('uuid');
const mongodb = require('mongodb');
const ws = require('ws');
const MongoClient = mongodb.MongoClient;
const ObjectID = mongodb.ObjectId;
//const Server = ws.Server;

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
const connectedPlayers = new Map();

const app = express();
app.set('port', (process.env.PORT || 5000));
app.use(express.static('/public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// headless websocket server prints to console
const wsServer = new ws.Server({noServer: true});
wsServer.on('connection', socket => {
  console.log('web socket connection');
  socket.uuidv4 = uuidv4();
  waitingPlayers.push(socket);
  socket.on('message', json => {
    const clientMsg = JSON.parse(json);
    if (!clientMsg.state) {
      socket.send(JSON.stringify({message: { uuid: socket.uuidv4, status: 'ok', data:'waiting on another player'}}));
    } else {
      const game = connectedPlayers.get(clientMsg.id);
      if (game.board[clientMsg.boardIndex] == '') {
        // space is free - set player token
        const token = (game.player1.uuidv4 == socket.uuidv4) ? 'O':'X';
        game.board[clientMsg.boardIndex] = token;
        game.state = (game.state == game.player1.uuidv4) ? game.player2.uuidv4 : game.player1.uuidv4;
        updatePlayers(game);
      } else {
        // space is already taken...
      }
    }
  });
  socket.on('close', event => {
    console.log('socket closed ' + socket.uuidv4 + JSON.stringify(event));
    // notify other player that this player disconnected if there was a game running
  });
});

const updatePlayers = (game) => {
  const { board, state, id } = game;
  game.player1.send(JSON.stringify({board, state, id}));
  game.player2.send(JSON.stringify({board, state, id}));
}

const connectPlayers = (p1, p2) => {
  const gameId = uuidv4();
  const game = {
    board : ['','','','','','','','',''],
    player1 : p1,
    player2 : p2,
    state : p1.uuidv4,
    id : gameId
  }
  connectedPlayers.set(gameId, game);
  updatePlayers(game);
}

const checkWaitingPlayers = () => {
  if (waitingPlayers.length >= 2) {
    const p1 = waitingPlayers.pop();
    const p2 = waitingPlayers.pop();
    connectPlayers(p1, p2);
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
