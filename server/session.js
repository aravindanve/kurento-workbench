const kurentoClient = require('kurento-client');
const WebSocket = require('ws');
const getKurento = require('./getKurento');

let clients = {};
let candidatesQueue = {};

process.on('SIGINT', () => {
  console.log('Releasing all resources...');
  for (const client of Object.keys(clients)) {
    client.pipeline && client.pipeline.release();
  }
  process.exit(0);
});

function _createWebRtcEndpointsAndHubPorts(pipeline, composite, num, cb) {
  let bailed = false;
  const hubPorts = [];
  const rtcEndpoints = [];
  for (let i = 0; i < num; i++) {
    composite.createHubPort((err, hubPort) => {
      if (bailed) return;
      if (err) {
        bailed = true;
        return cb(err);
      }

      hubPorts.push(hubPort);
      pipeline.create('WebRtcEndpoint', (err, rtcEndpoint) => {
        if (bailed) return;
        if (err) {
          bailed = true;
          return cb(err);
        }

        rtcEndpoints.push(rtcEndpoint);
        if (rtcEndpoints.length === num) {
          cb(undefined, { hubPorts, rtcEndpoints });
        }
      });
    });
  }
}

function _connectWebRtcEndpoints(ws, rtcEndpoints, sdpOffers, hubPorts, cb) {
  let bailed = false;
  const num = Math.min(rtcEndpoints.length, hubPorts.length, sdpOffers.length);
  const sdpAnswers = [];
  for (let i = 0; i < num; i++) {
    rtcEndpoints[i].connect(hubPorts[i], err => {
      if (bailed) return;
      if (err) {
        bailed = true;
        return cb(err);
      }

      hubPorts[i].connect(rtcEndpoints[i], err => {
        if (bailed) return;
        if (err) {
          bailed = true;
          return cb(err);
        }

        rtcEndpoints[i].on('OnIceCandidate', event => {
          var candidate = kurentoClient.getComplexType('IceCandidate')(event.candidate);
          ws.send(JSON.stringify({
            id: 'iceCandidate',
            sdpIndex: i,
            candidate: candidate
          }));
        });

        rtcEndpoints[i].processOffer(sdpOffers[i], (err, sdpAnswer) => {
          if (bailed) return;
          if (err) {
            bailed = true;
            return cb(err);
          }

          sdpAnswers.push(sdpAnswer);
          if (sdpAnswers.length === num) {
            cb(undefined, sdpAnswers);
          }
        });
      });
    });
  }
}

function startPresenter(wsId, ws, sdpOffers, cb) {
  const client = clients[wsId] = {
    pipeline: undefined,
    composite: undefined,
    hubPorts: [],
    rtcEndpoints: [],
    ws
  };
  getKurento((err, kurento) => {
    if (err) {
      stop(wsId);
      return cb(err);
    }
    kurento.create('MediaPipeline', (err, pipeline) => {
      if (err) {
        stop(wsId);
        return cb(err);
      }

      client.pipeline = pipeline;
      pipeline.create('Composite', (err, composite) => {
        if (err) {
          stop(wsId);
          return cb(err);
        }

        client.composite = composite;
        composite.createHubPort((err, hubPort) => {
          if (err) {
            stop(wsId);
            return cb(err);
          }

          client.hubPort = hubPort;
          _createWebRtcEndpointsAndHubPorts(pipeline, composite, sdpOffers.length, (err, { hubPorts, rtcEndpoints }) => {
            if (err) {
              stop(wsId);
              return cb(err);
            }

            client.hubPorts = hubPorts;
            client.rtcEndpoints = rtcEndpoints;
            if (candidatesQueue[wsId]) {
              for (let i = 0; i < Math.min(rtcEndpoints.length, candidatesQueue[wsId].length); i++) {
                if (candidatesQueue[wsId][i]) {
                  while (candidatesQueue[wsId][i].length) {
                    console.log('adding Ice Candidates for sdpIndex:', i);
                    rtcEndpoints[i].addIceCandidate(candidatesQueue[wsId][i].shift());
                  }
                }
              }
            }

            _connectWebRtcEndpoints(ws, rtcEndpoints, sdpOffers, hubPorts, (err, sdpAnswers) => {
              if (err) {
                stop(wsId);
                return cb(err);
              }

              cb(undefined, sdpAnswers);
              for (let i = 0; i < rtcEndpoints.length; i++) {
                rtcEndpoints[i].gatherCandidates(err => {
                  if (err) {
                    stop(wsId);
                    console.log('ERROR gathering candidates', err);
                    ws.send(JSON.stringify({
                      id: 'error',
                      message: err
                    }));
                  }
                });
              }
            });
          });
        });
      });
    });
  });
}

function stop(wsId) {
  delete candidatesQueue[wsId];
  if (!clients[wsId]) return;
  console.log('releasing resources for', wsId);
  clients[wsId].pipeline && clients[wsId].pipeline.release();
  clients[wsId].ws.readyState === WebSocket.OPEN  &&
    clients[wsId].ws.send(JSON.stringify({
      id: 'stopCommunication'
    }));
}

function onIceCandidate(wsId, sdpIndex, _candidate) {
  var candidate = kurentoClient.getComplexType('IceCandidate')(_candidate);

  if (clients[wsId] && clients[wsId].rtcEndpoints && clients[wsId].rtcEndpoints[sdpIndex]) {
    console.log('adding Ice Candidates for sdpIndex:', sdpIndex);
    clients[wsId].rtcEndpoints[sdpIndex].addIceCandidate(candidate);

  } else {
    candidatesQueue[wsId] = candidatesQueue[wsId] || [];
    candidatesQueue[wsId][sdpIndex] = candidatesQueue[wsId][sdpIndex] || [];
    candidatesQueue[wsId][sdpIndex].push(candidate);
  }
}

module.exports = {
  startPresenter,
  stop,
  onIceCandidate
};
