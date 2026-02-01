const WebSocket = require('ws');
console.log('Starting WebSocket test...');
const ws = new WebSocket('ws://localhost:12112/agent', {
  headers: { 'Authorization': 'Token KEY_test_12345678901234567890' }
});
ws.on('open', () => {
  console.log('Connected');
});
ws.on('message', (data) => {
  console.log('Received message, type:', typeof data, 'isBuffer:', Buffer.isBuffer(data));
  let msg;
  if (Buffer.isBuffer(data)) {
    msg = data.toString('utf8');
  } else {
    msg = data.toString();
  }
  console.log('Message content:', msg.substring(0, 200));
  try {
    const parsed = JSON.parse(msg);
    console.log('Parsed type:', parsed.type);
    if (parsed.type === 'Welcome') {
      console.log('SUCCESS: Welcome message received!');
      console.log('  Session ID:', parsed.session_id);
      // Send some audio to trigger more events
      console.log('Sending 60 audio packets...');
      for (let i = 0; i < 60; i++) {
        ws.send(Buffer.alloc(160, 0x7F));
      }
    }
    if (parsed.type === 'ConversationText') {
      console.log('SUCCESS: ConversationText received - STT working!');
      console.log('  Role:', parsed.role);
      console.log('  Content:', parsed.content);
    }
    if (parsed.type === 'UserStartedSpeaking') {
      console.log('User started speaking!');
    }
  } catch (e) {
    console.log('Not JSON, probably audio data');
  }
});
ws.on('error', (e) => console.log('Error:', e.message));
ws.on('close', () => console.log('Connection closed'));
setTimeout(() => {
  console.log('Test complete, closing...');
  ws.close();
  process.exit(0);
}, 5000);
