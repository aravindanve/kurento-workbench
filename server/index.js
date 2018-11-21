const fs = require('fs');
const path = require('path');
const https = require('https');
const express = require('express');
const WebSocket = require('ws');
const config = require('./config');
const session = require('./session');
const getNextId = require('./getNextId');

const serverOptions = {
  key: fs.readFileSync(path.resolve(config.tlsKeyFile)),
  cert: fs.readFileSync(path.resolve(config.tlsCertFile))
};

const static = express.static(path.resolve(config.clientDir));
const app = express().use(static);
const server = new https.createServer(serverOptions, app);
const wss = new WebSocket.Server({ server, path: '/' });

const accept = (data) => ({
  response: 'accepted',
  ...data
});

const reject = (data) => ({
  response: 'rejected',
  ...data
});

wss.on('connection', ws => {
  var wsId = getNextId();
  console.log('INFO WebSocket connection', wsId);

  const emit = (id, data) =>
    ws.send(JSON.stringify({ id, ...data }));

  ws.on('error', e =>
    console.log('ERROR', e.message));

  ws.on('close', () =>
    console.log('INFO WebSocket close', ws.id));

  ws.on('message', message => {
    const data = JSON.parse(message);

    switch (data.id) {
      case 'presenter':
        session.startPresenter(wsId, ws, data.sdpOffers, (err, sdpAnswers) => {
          if (err) {
            return emit(
              'presenterResponse',
              reject({ message: err }));
          }
          emit(
            'presenterResponse',
            accept({ sdpAnswers }));
        });
        break;

      // case 'viewer':
      //   session.startViewer(wsId, ws, data.sdpOffer, (err, sdpAnswer) => {
      //     if (err) {
      //       return emit(
      //         'presenterResponse',
      //         reject({ message: err }));
      //     }
      //     emit(
      //       'presenterResponse',
      //       accept({ sdpAnswer }));
      //   });
      //   break;

      case 'stop':
        session.stop(wsId);
        break;

      case 'onIceCandidate':
        session.onIceCandidate(wsId, data.sdpIndex, data.candidate);
        break;

      default:
        emit('error', reject({
          message: `Invalid message id: ${id}`
        }));
        break;
    }
  });
});

server.listen(config.port, config.host, () =>
  console.log(`LISTENING on https://${config.host}:${config.port}`));
