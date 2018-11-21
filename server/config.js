module.exports = {
  host: process.env.HOST || '127.0.0.1',
  port: process.env.PORT | '8443',
  tlsCertFile: process.env.TLS_CERT_FILE || `${__dirname}/../tls/cert.pem`,
  tlsKeyFile: process.env.TLS_KEY_FILE || `${__dirname}/../tls/key.pem`,
  clientDir: process.env.CLIENT_DIR || `${__dirname}/../client`,
  kurentoWsUrl: process.env.KURENTO_WS_URL || 'ws://ec2-34-229-132-6.compute-1.amazonaws.com:8888/kurento'
};
