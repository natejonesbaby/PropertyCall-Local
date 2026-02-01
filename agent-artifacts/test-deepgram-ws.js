const WebSocket = require('./backend/node_modules/ws');
const ws = new WebSocket('ws://localhost:12112/agent', {
  headers: { 'Authorization': 'Token valid_test_key_1234567890' }
});

ws.on('open', () => {
  console.log('WebSocket connected successfully!');
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  console.log('Received:', msg.type);
  if (msg.type === 'Welcome') {
    console.log('Session ID:', msg.session_id);
    console.log('SUCCESS: WebSocket connection established and Welcome message received');
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('Timeout waiting for WebSocket');
  process.exit(1);
}, 5000);
