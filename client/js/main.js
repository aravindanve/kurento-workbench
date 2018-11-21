const ws = new WebSocket('wss://' + location.host);
let localVideos;
let remoteVideos;
let rtcPeers;

window.onload = () => {
  localVideos = document.querySelectorAll('video.local');
  remoteVideos = document.querySelectorAll('video.remote');

  document
    .getElementById('startButton')
    .addEventListener('click', () => start());
  document
    .getElementById('stopButton')
    .addEventListener('click', () => stop());
};

window.onbeforeunload = () => {
  ws.close();
};

ws.onmessage = (message) => {
  const data = JSON.parse(message.data);
  console.info('Received message', data);

  switch (data.id) {
    case 'presenterResponse':
      presenterResponse(data);
      break;
    case 'stopCommunication':
      dispose();
      break;
    case 'iceCandidate':
      rtcPeers && rtcPeers[data.sdpIndex] &&
        rtcPeers[data.sdpIndex].addIceCandidate(data.candidate);
      break;
    case 'error':
      console.error('Server Error', data);
      break;
    default:
      console.error('Unrecognized message', parsedMessage);
  }
};

function presenterResponse({ response, sdpAnswers, message }) {
  if (response !== 'accepted') {
    console.error(message);
    dispose();
    return;
  }
  for (let i = 0; i < Math.min(sdpAnswers.length, rtcPeers.length); i++) {
    rtcPeers[i].processAnswer(sdpAnswers[i]);
  }
}

function _createWebRtcPeers(cb) {
  let bailed = false;
  const num = localVideos ? localVideos.length : 0;
  const rtcPeers = [];
  for (let i = 0; i < num; i++) {
    const rtcPeer = kurentoUtils.WebRtcPeer[
      remoteVideos && remoteVideos[i]
      ? 'WebRtcPeerSendrecv' : 'WebRtcPeerSendonly'

    ]({
      localVideo: localVideos[i],
      remoteVideo: remoteVideos && remoteVideos[i],
      onicecandidate: candidate => onIceCandidate(i, candidate)

    }, err => {
      if (bailed) return;
      if (err) {
        bailed = true;
        return cb(err);
      }
      rtcPeers.push(rtcPeer);
      if (rtcPeers.length === num) {
        cb(undefined, rtcPeers);
      }
    });
  }
}

function _generateOffers(cb) {
  let bailed = false;
  const num = rtcPeers ? rtcPeers.length : 0;
  const sdpOffers = [];
  for (let i = 0; i < num; i++) {
    rtcPeers[i].generateOffer((err, sdpOffer) => {
      if (bailed) return;
      if (err) {
        bailed = true;
        return cb(err);
      }
      sdpOffers.push(sdpOffer);
      if (sdpOffers.length === num) {
        cb(undefined, sdpOffers);
      }
    });
  }
}

function start() {
  if (!rtcPeers) {
    console.log('starting...');

    _createWebRtcPeers((err, _rtcPeers) => {
      if (err) return console.error(err);

      rtcPeers = _rtcPeers;
      _generateOffers((err, sdpOffers) => {
        if (err) return console.error(err);

        sendMessage({
          id: 'presenter',
          sdpOffers
        });
      });
    });
  }
}

function onIceCandidate(sdpIndex, candidate) {
  console.log('Local candidate', candidate);

  sendMessage({
    id: 'onIceCandidate',
    sdpIndex,
    candidate: candidate
  });
}

function stop() {
  if (rtcPeers) {
    console.log('stopping...');

    sendMessage({
      id: 'stop'
    });
    dispose();
  }
}

function dispose() {
  if (rtcPeers) {
    for (let i = 0; i < rtcPeers.length; i++) {
      rtcPeers[i].dispose();
    }
    rtcPeers = undefined;
  }
}

function sendMessage(message) {
  console.log('Senging message', message);
  ws.send(JSON.stringify(message));
}
