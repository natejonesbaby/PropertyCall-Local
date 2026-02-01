import { AudioBridge } from './backend/src/services/audioBridgeV2.js';

try {
  const bridge = new AudioBridge({ provider: 'telnyx' });
  console.log('Bridge created successfully');
  console.log('Provider:', bridge.provider);
  console.log('Has audio adapter:', !!bridge.audioAdapter);
  console.log('Listener count:', bridge.getListenerCount());
} catch (error) {
  console.error('Error creating bridge:', error);
  console.error('Stack:', error.stack);
}
