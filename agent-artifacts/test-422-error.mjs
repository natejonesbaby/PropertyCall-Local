import { mapTelnyxError } from './backend/src/providers/telephony-errors.js';

const error422 = mapTelnyxError({
  status: 422,
  message: 'Validation failed'
});

console.log('Error type:', error422.constructor.name);
console.log('Error code:', error422.code);
console.log('Is ValidationError?', error422.code === 'VALIDATION_ERROR');
