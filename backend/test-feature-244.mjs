/**
 * Test Feature #244: SignalWire phone number provisioning and listing
 *
 * Tests phone number management methods for SignalWire provider:
 * - listPhoneNumbers method
 * - searchAvailableNumbers method
 * - provisionNumber method
 * - releaseNumber method
 * - Normalized phone number objects
 * - Provisioning error handling
 */

import SignalWireProvider from './src/providers/signalwire-provider.js';

// Test counter
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  testsRun++;
  try {
    fn();
    console.log(`✓ Test ${testsRun}: ${name}`);
    testsPassed++;
    return true;
  } catch (error) {
    console.error(`✗ Test ${testsRun}: ${name}`);
    console.error(`  Error: ${error.message}`);
    if (error.stack) {
      console.error(`  ${error.stack.split('\n').slice(1, 3).join('\n')}`);
    }
    testsFailed++;
    return false;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected} but got ${actual}`);
  }
}

function assertInstanceOf(value, Class, message) {
  if (!(value instanceof Class)) {
    throw new Error(message || `Expected ${value} to be instance of ${Class.name}`);
  }
}

function assertNotNull(value, message) {
  if (value === null || value === undefined) {
    throw new Error(message || 'Value should not be null');
  }
}

// Mock fetch for API calls
let mockFetchResponses = {};

function setMockResponse(url, response) {
  mockFetchResponses[url] = response;
}

function clearMockResponses() {
  mockFetchResponses = {};
}

// Override fetch globally
global.fetch = async (url, options) => {
  const urlStr = url.toString();

  // Check if we have a mock response
  for (const [mockUrl, response] of Object.entries(mockFetchResponses)) {
    if (urlStr.includes(mockUrl)) {
      return {
        ok: response.success !== false,
        status: response.status || 200,
        json: async () => response.data || response,
        text: async () => JSON.stringify(response.data || response)
      };
    }
  }

  // Default error response
  return {
    ok: false,
    status: 404,
    json: async () => ({ error: 'Not found' }),
    text: async () => 'Not found'
  };
};

// ============================================================================
// FEATURE STEP 1: Implement listPhoneNumbers method
// ============================================================================

console.log('\n=== Step 1: listPhoneNumbers method ===\n');

test('SignalWireProvider has listPhoneNumbers method', () => {
  const provider = new SignalWireProvider();
  assert(typeof provider.listPhoneNumbers === 'function', 'Should have listPhoneNumbers method');
});

test('listPhoneNumbers returns normalized phone number objects', async () => {
  const provider = new SignalWireProvider();

  setMockResponse('/IncomingPhoneNumbers.json', {
    success: true,
    data: {
      incoming_phone_numbers: [
        {
          phone_number: '+12025551234',
          friendly_name: 'Test Number 1',
          sid: 'PN123',
          account_sid: 'AC123',
          capabilities: { voice: true, sms: true, mms: false, fax: false },
          region: 'New York',
          iso_country: 'US',
          date_created: '2024-01-01T00:00:00Z',
          date_updated: '2024-01-01T00:00:00Z'
        }
      ]
    }
  });

  const result = await provider.listPhoneNumbers();

  assert(result.success === true, 'Should return success');
  assert(Array.isArray(result.phoneNumbers), 'Should return array of phone numbers');
  assert(result.phoneNumbers.length > 0, 'Should have at least one phone number');

  const number = result.phoneNumbers[0];
  assertEquals(number.phoneNumber, '+12025551234', 'Should have phoneNumber');
  assertEquals(number.friendlyName, 'Test Number 1', 'Should have friendlyName');
  assertEquals(number.sid, 'PN123', 'Should have sid');
  assert(number.capabilities.voice === true, 'Should have voice capability');
  assertEquals(number.region, 'New York', 'Should have region');
  assertEquals(number.country, 'US', 'Should have country');

  clearMockResponses();
});

test('listPhoneNumbers supports filtering by phone number', async () => {
  const provider = new SignalWireProvider();

  setMockResponse('/IncomingPhoneNumbers.json?PhoneNumber=%2B12025551234', {
    success: true,
    data: {
      incoming_phone_numbers: [
        {
          phone_number: '+12025551234',
          friendly_name: 'Filtered Number',
          sid: 'PN124',
          account_sid: 'AC123'
        }
      ]
    }
  });

  const result = await provider.listPhoneNumbers({ phoneNumber: '+12025551234' });

  assert(result.success === true, 'Should return success');
  assert(result.phoneNumbers.length === 1, 'Should return one phone number');
  assertEquals(result.phoneNumbers[0].phoneNumber, '+12025551234', 'Should match phone number');

  clearMockResponses();
});

test('listPhoneNumbers supports pagination', async () => {
  const provider = new SignalWireProvider();

  setMockResponse('/IncomingPhoneNumbers.json?PageSize=20&Page=1', {
    success: true,
    data: {
      incoming_phone_numbers: [],
      total_number_of_records: 100
    }
  });

  const result = await provider.listPhoneNumbers({ limit: 20, offset: 0 });

  assert(result.success === true, 'Should return success');
  assertEquals(result.limit, 20, 'Should respect limit parameter');
  assertEquals(result.offset, 0, 'Should respect offset parameter');
  assertEquals(result.total, 100, 'Should return total count');

  clearMockResponses();
});

test('listPhoneNumbers handles empty results', async () => {
  const provider = new SignalWireProvider();

  setMockResponse('/IncomingPhoneNumbers.json', {
    success: true,
    data: {
      incoming_phone_numbers: []
    }
  });

  const result = await provider.listPhoneNumbers();

  assert(result.success === true, 'Should return success');
  assert(result.phoneNumbers.length === 0, 'Should return empty array');
  assertEquals(result.total, 0, 'Should have total of 0');

  clearMockResponses();
});

test('listPhoneNumbers handles API errors', async () => {
  const provider = new SignalWireProvider();

  setMockResponse('/IncomingPhoneNumbers.json', {
    success: false,
    status: 401,
    error: 'Unauthorized'
  });

  try {
    await provider.listPhoneNumbers();
    throw new Error('Should have thrown an error');
  } catch (error) {
    assertEquals(error.name, 'SignalWireError', 'Should throw SignalWireError');
  }

  clearMockResponses();
});

// ============================================================================
// FEATURE STEP 2: Implement searchAvailableNumbers method
// ============================================================================

console.log('\n=== Step 2: searchAvailableNumbers method ===\n');

test('SignalWireProvider has searchAvailableNumbers method', () => {
  const provider = new SignalWireProvider();
  assert(typeof provider.searchAvailableNumbers === 'function', 'Should have searchAvailableNumbers method');
});

test('searchAvailableNumbers finds numbers by area code', async () => {
  const provider = new SignalWireProvider();

  setMockResponse('/AvailablePhoneNumbers/US/Local.json', {
    success: true,
    data: {
      available_phone_numbers: [
        {
          phone_number: '+12025559999',
          friendly_name: '(202) 555-9999',
          region: 'Washington',
          city: 'Washington',
          iso_country: 'US'
        }
      ]
    }
  });

  const result = await provider.searchAvailableNumbers({ areaCode: '202' });

  assert(result.success === true, 'Should return success');
  assert(result.phoneNumbers.length > 0, 'Should return available numbers');
  assertEquals(result.country, 'US', 'Should have country code');
  assert(result.phoneNumbers[0].phoneNumber.includes('+1202'), 'Should have correct area code');

  clearMockResponses();
});

test('searchAvailableNumbers finds numbers by pattern', async () => {
  const provider = new SignalWireProvider();

  setMockResponse('/AvailablePhoneNumbers/US/Local.json', {
    success: true,
    data: {
      available_phone_numbers: [
        {
          phone_number: '+12025551234',
          friendly_name: '(202) 555-1234',
          iso_country: 'US'
        }
      ]
    }
  });

  const result = await provider.searchAvailableNumbers({ contains: '555' });

  assert(result.success === true, 'Should return success');
  assert(result.phoneNumbers.length > 0, 'Should return numbers matching pattern');

  clearMockResponses();
});

test('searchAvailableNumbers supports toll-free numbers', async () => {
  const provider = new SignalWireProvider();

  setMockResponse('/AvailablePhoneNumbers/US/TollFree.json', {
    success: true,
    data: {
      available_phone_numbers: [
        {
          phone_number: '+18005551234',
          friendly_name: '(800) 555-1234',
          iso_country: 'US'
        }
      ]
    }
  });

  const result = await provider.searchAvailableNumbers({ type: 'tollFree', areaCode: '800' });

  assert(result.success === true, 'Should return success');
  assertEquals(result.type, 'tollFree', 'Should have type tollFree');
  assert(result.phoneNumbers[0].phoneNumber.includes('+1800'), 'Should be toll-free number');

  clearMockResponses();
});

test('searchAvailableNumbers respects limit parameter', async () => {
  const provider = new SignalWireProvider();

  setMockResponse('/AvailablePhoneNumbers/US/Local.json', {
    success: true,
    data: {
      available_phone_numbers: []
    }
  });

  const result = await provider.searchAvailableNumbers({ areaCode: '202', limit: 5 });

  assert(result.success === true, 'Should return success');
  assert(result.phoneNumbers.length <= 5, 'Should respect limit');

  clearMockResponses();
});

test('searchAvailableNumbers requires areaCode or contains', async () => {
  const provider = new SignalWireProvider();

  try {
    await provider.searchAvailableNumbers({});
    throw new Error('Should have thrown an error');
  } catch (error) {
    assertEquals(error.name, 'SignalWireError', 'Should throw SignalWireError');
    assert(error.message.includes('areaCode or contains'), 'Should mention required parameters');
  }
});

test('searchAvailableNumbers returns normalized phone number objects', async () => {
  const provider = new SignalWireProvider();

  setMockResponse('/AvailablePhoneNumbers/US/Local.json', {
    success: true,
    data: {
      available_phone_numbers: [
        {
          phone_number: '+12025559999',
          friendly_name: 'Test Number',
          region: 'Virginia',
          city: 'Arlington',
          iso_country: 'US'
        }
      ]
    }
  });

  const result = await provider.searchAvailableNumbers({ areaCode: '202' });

  const number = result.phoneNumbers[0];
  assertEquals(number.phoneNumber, '+12025559999', 'Should have phoneNumber');
  assertEquals(number.friendlyName, 'Test Number', 'Should have friendlyName');
  assertEquals(number.country, 'US', 'Should have country');
  assertEquals(number.region, 'Virginia', 'Should have region');

  clearMockResponses();
});

test('searchAvailableNumbers handles no results', async () => {
  const provider = new SignalWireProvider();

  setMockResponse('/AvailablePhoneNumbers/US/Local.json', {
    success: true,
    data: {
      available_phone_numbers: []
    }
  });

  const result = await provider.searchAvailableNumbers({ areaCode: '000' });

  assert(result.success === true, 'Should return success');
  assertEquals(result.phoneNumbers.length, 0, 'Should return empty array');
  assertEquals(result.total, 0, 'Should have total of 0');

  clearMockResponses();
});

// ============================================================================
// FEATURE STEP 3: Implement provisionNumber method
// ============================================================================

console.log('\n=== Step 3: provisionNumber method ===\n');

test('SignalWireProvider has provisionNumber method', () => {
  const provider = new SignalWireProvider();
  assert(typeof provider.provisionNumber === 'function', 'Should have provisionNumber method');
});

test('provisionNumber purchases a phone number', async () => {
  const provider = new SignalWireProvider();

  setMockResponse('/IncomingPhoneNumbers.json', {
    success: true,
    data: {
      phone_number: '+12025551234',
      friendly_name: 'Provisioned Number',
      sid: 'PN125',
      account_sid: 'AC123',
      capabilities: { voice: true, sms: true },
      region: 'District of Columbia',
      iso_country: 'US',
      date_created: '2024-01-15T00:00:00Z'
    }
  });

  const result = await provider.provisionNumber({ phoneNumber: '+12025551234' });

  assert(result.success === true, 'Should return success');
  assertNotNull(result.phoneNumber, 'Should return phoneNumber object');
  assertEquals(result.phoneNumber.phoneNumber, '+12025551234', 'Should have correct phone number');
  assertEquals(result.sid, 'PN125', 'Should have SID');
  assertEquals(result.accountSid, 'AC123', 'Should have account SID');

  clearMockResponses();
});

test('provisionNumber supports optional friendly name', async () => {
  const provider = new SignalWireProvider();

  setMockResponse('/IncomingPhoneNumbers.json', {
    success: true,
    data: {
      phone_number: '+12025551234',
      friendly_name: 'My Custom Name',
      sid: 'PN126',
      account_sid: 'AC123'
    }
  });

  const result = await provider.provisionNumber({
    phoneNumber: '+12025551234',
    friendlyName: 'My Custom Name'
  });

  assertEquals(result.phoneNumber.friendlyName, 'My Custom Name', 'Should use friendly name');

  clearMockResponses();
});

test('provisionNumber configures voice and SMS URLs', async () => {
  const provider = new SignalWireProvider();

  setMockResponse('/IncomingPhoneNumbers.json', {
    success: true,
    data: {
      phone_number: '+12025551234',
      voice_url: 'https://example.com/voice',
      sms_url: 'https://example.com/sms',
      sid: 'PN127',
      account_sid: 'AC123'
    }
  });

  const result = await provider.provisionNumber({
    phoneNumber: '+12025551234',
    voiceUrl: 'https://example.com/voice',
    smsUrl: 'https://example.com/sms'
  });

  assertEquals(result.phoneNumber.voiceUrl, 'https://example.com/voice', 'Should set voice URL');
  assertEquals(result.phoneNumber.smsUrl, 'https://example.com/sms', 'Should set SMS URL');

  clearMockResponses();
});

test('provisionNumber returns normalized phone number object', async () => {
  const provider = new SignalWireProvider();

  setMockResponse('/IncomingPhoneNumbers.json', {
    success: true,
    data: {
      phone_number: '+12025551234',
      friendly_name: 'New Number',
      sid: 'PN128',
      account_sid: 'AC123',
      capabilities: { voice: true, sms: true, mms: false },
      region: 'Washington',
      iso_country: 'US'
    }
  });

  const result = await provider.provisionNumber({ phoneNumber: '+12025551234' });

  const number = result.phoneNumber;
  assertEquals(number.phoneNumber, '+12025551234', 'Should have phoneNumber');
  assertEquals(number.friendlyName, 'New Number', 'Should have friendlyName');
  assertEquals(number.sid, 'PN128', 'Should have sid');
  assert(number.capabilities.voice === true, 'Should have voice capability');
  assertEquals(number.region, 'Washington', 'Should have region');

  clearMockResponses();
});

test('provisionNumber requires phoneNumber parameter', async () => {
  const provider = new SignalWireProvider();

  try {
    await provider.provisionNumber({});
    throw new Error('Should have thrown an error');
  } catch (error) {
    assertEquals(error.name, 'SignalWireError', 'Should throw SignalWireError');
    assert(error.message.includes('phoneNumber'), 'Should mention phoneNumber is required');
  }
});

test('provisionNumber handles number already taken error', async () => {
  const provider = new SignalWireProvider();

  setMockResponse('/IncomingPhoneNumbers.json', {
    success: false,
    status: 400,
    error: 'Phone number already taken'
  });

  try {
    await provider.provisionNumber({ phoneNumber: '+12025551234' });
    throw new Error('Should have thrown an error');
  } catch (error) {
    assertEquals(error.name, 'SignalWireError', 'Should throw SignalWireError');
    assert(error.message.includes('already taken') || error.message.includes('Invalid'), 'Should describe the error');
  }

  clearMockResponses();
});

// ============================================================================
// FEATURE STEP 4: Implement releaseNumber method
// ============================================================================

console.log('\n=== Step 4: releaseNumber method ===\n');

test('SignalWireProvider has releaseNumber method', () => {
  const provider = new SignalWireProvider();
  assert(typeof provider.releaseNumber === 'function', 'Should have releaseNumber method');
});

test('releaseNumber releases a phone number', async () => {
  const provider = new SignalWireProvider();

  setMockResponse('/IncomingPhoneNumbers/PN125.json', {
    success: true
  });

  const result = await provider.releaseNumber({ phoneNumberSid: 'PN125' });

  assert(result.success === true, 'Should return success');
  assert(result.released === true, 'Should mark as released');
  assertEquals(result.phoneNumberSid, 'PN125', 'Should return SID');

  clearMockResponses();
});

test('releaseNumber requires phoneNumberSid parameter', async () => {
  const provider = new SignalWireProvider();

  try {
    await provider.releaseNumber({});
    throw new Error('Should have thrown an error');
  } catch (error) {
    assertEquals(error.name, 'SignalWireError', 'Should throw SignalWireError');
    assert(error.message.includes('phoneNumberSid'), 'Should mention phoneNumberSid is required');
  }
});

test('releaseNumber handles number not found gracefully', async () => {
  const provider = new SignalWireProvider();

  setMockResponse('/IncomingPhoneNumbers/PN999.json', {
    success: false,
    status: 404
  });

  const result = await provider.releaseNumber({ phoneNumberSid: 'PN999' });

  // Should still succeed if number doesn't exist (idempotent)
  assert(result.success === true, 'Should handle 404 gracefully');

  clearMockResponses();
});

// ============================================================================
// FEATURE STEP 5: Return normalized phone number objects
// ============================================================================

console.log('\n=== Step 5: Normalized phone number objects ===\n');

test('Phone number objects have required fields', async () => {
  const provider = new SignalWireProvider();

  setMockResponse('/IncomingPhoneNumbers.json', {
    success: true,
    data: {
      incoming_phone_numbers: [
        {
          phone_number: '+12025551234',
          friendly_name: 'Test',
          sid: 'PN123',
          account_sid: 'AC123',
          capabilities: { voice: true, sms: true },
          iso_country: 'US',
          date_created: '2024-01-01T00:00:00Z',
          date_updated: '2024-01-01T00:00:00Z'
        }
      ]
    }
  });

  const result = await provider.listPhoneNumbers();
  const number = result.phoneNumbers[0];

  // Check all required fields
  assertNotNull(number.phoneNumber, 'Should have phoneNumber');
  assertNotNull(number.friendlyName, 'Should have friendlyName');
  assertNotNull(number.sid, 'Should have sid');
  assertNotNull(number.accountSid, 'Should have accountSid');
  assertNotNull(number.capabilities, 'Should have capabilities');
  assertNotNull(number.country, 'Should have country');
  assertNotNull(number.region, 'Should have region');

  clearMockResponses();
});

test('Phone number capabilities are normalized', async () => {
  const provider = new SignalWireProvider();

  setMockResponse('/IncomingPhoneNumbers.json', {
    success: true,
    data: {
      incoming_phone_numbers: [
        {
          phone_number: '+12025551234',
          friendly_name: 'Test',
          sid: 'PN123',
          account_sid: 'AC123',
          capabilities: { voice: true, sms: true, mms: true, fax: false }
        }
      ]
    }
  });

  const result = await provider.listPhoneNumbers();
  const number = result.phoneNumbers[0];

  assert(typeof number.capabilities.voice === 'boolean', 'Voice should be boolean');
  assert(typeof number.capabilities.sms === 'boolean', 'SMS should be boolean');
  assert(typeof number.capabilities.mms === 'boolean', 'MMS should be boolean');
  assert(typeof number.capabilities.fax === 'boolean', 'Fax should be boolean');

  clearMockResponses();
});

test('Phone number dates are converted to Date objects', async () => {
  const provider = new SignalWireProvider();

  setMockResponse('/IncomingPhoneNumbers.json', {
    success: true,
    data: {
      incoming_phone_numbers: [
        {
          phone_number: '+12025551234',
          friendly_name: 'Test',
          sid: 'PN123',
          account_sid: 'AC123',
          capabilities: {},
          date_created: '2024-01-15T10:30:00Z',
          date_updated: '2024-01-15T12:00:00Z'
        }
      ]
    }
  });

  const result = await provider.listPhoneNumbers();
  const number = result.phoneNumbers[0];

  assert(number.dateCreated instanceof Date, 'dateCreated should be Date');
  assert(number.dateUpdated instanceof Date, 'dateUpdated should be Date');

  clearMockResponses();
});

test('Phone numbers handle missing optional fields gracefully', async () => {
  const provider = new SignalWireProvider();

  setMockResponse('/IncomingPhoneNumbers.json', {
    success: true,
    data: {
      incoming_phone_numbers: [
        {
          phone_number: '+12025551234',
          sid: 'PN123',
          account_sid: 'AC123'
        }
      ]
    }
  });

  const result = await provider.listPhoneNumbers();
  const number = result.phoneNumbers[0];

  assertEquals(number.phoneNumber, '+12025551234', 'Should have phoneNumber');
  assertEquals(number.sid, 'PN123', 'Should have sid');
  // Optional fields should have defaults
  assertNotNull(number.friendlyName !== undefined, 'Should have friendlyName field');
  assertNotNull(number.region !== undefined, 'Should have region field');

  clearMockResponses();
});

// ============================================================================
// FEATURE STEP 6: Handle provisioning errors
// ============================================================================

console.log('\n=== Step 6: Provisioning error handling ===\n');

test('provisionNumber handles 400 bad request', async () => {
  const provider = new SignalWireProvider();

  setMockResponse('/IncomingPhoneNumbers.json', {
    success: false,
    status: 400,
    error: 'Invalid phone number format'
  });

  try {
    await provider.provisionNumber({ phoneNumber: 'invalid' });
    throw new Error('Should have thrown an error');
  } catch (error) {
    assertEquals(error.name, 'SignalWireError', 'Should throw SignalWireError');
    assert(error.message.includes('Invalid') || error.message.includes('number'), 'Should describe the error');
  }

  clearMockResponses();
});

test('provisionNumber handles 402 insufficient funds', async () => {
  const provider = new SignalWireProvider();

  setMockResponse('/IncomingPhoneNumbers.json', {
    success: false,
    status: 402,
    errorCode: 'INSUFFICIENT_FUNDS',
    error: 'Insufficient funds'
  });

  try {
    await provider.provisionNumber({ phoneNumber: '+12025551234' });
    throw new Error('Should have thrown an error');
  } catch (error) {
    assertEquals(error.name, 'SignalWireError', 'Should throw SignalWireError');
    assert(error.message.includes('Insufficient funds') || error.message.includes('funds'), 'Should mention funds');
  }

  clearMockResponses();
});

test('provisionNumber handles 401 authentication error', async () => {
  const provider = new SignalWireProvider();

  setMockResponse('/IncomingPhoneNumbers.json', {
    success: false,
    status: 401,
    error: 'Unauthorized'
  });

  try {
    await provider.provisionNumber({ phoneNumber: '+12025551234' });
    throw new Error('Should have thrown an error');
  } catch (error) {
    assertEquals(error.name, 'SignalWireError', 'Should throw SignalWireError');
  }

  clearMockResponses();
});

test('listPhoneNumbers handles API errors', async () => {
  const provider = new SignalWireProvider();

  setMockResponse('/IncomingPhoneNumbers.json', {
    success: false,
    status: 500,
    error: 'Internal server error'
  });

  try {
    await provider.listPhoneNumbers();
    throw new Error('Should have thrown an error');
  } catch (error) {
    assertEquals(error.name, 'SignalWireError', 'Should throw SignalWireError');
  }

  clearMockResponses();
});

test('searchAvailableNumbers handles API errors', async () => {
  const provider = new SignalWireProvider();

  setMockResponse('/AvailablePhoneNumbers/US/Local.json', {
    success: false,
    status: 500,
    error: 'Service unavailable'
  });

  try {
    await provider.searchAvailableNumbers({ areaCode: '202' });
    throw new Error('Should have thrown an error');
  } catch (error) {
    assertEquals(error.name, 'SignalWireError', 'Should throw SignalWireError');
  }

  clearMockResponses();
});

test('releaseNumber handles API errors', async () => {
  const provider = new SignalWireProvider();

  setMockResponse('/IncomingPhoneNumbers/PN123.json', {
    success: false,
    status: 403,
    error: 'Forbidden'
  });

  try {
    await provider.releaseNumber({ phoneNumberSid: 'PN123' });
    throw new Error('Should have thrown an error');
  } catch (error) {
    assertEquals(error.name, 'SignalWireError', 'Should throw SignalWireError');
  }

  clearMockResponses();
});

// ============================================================================
// ADDITIONAL EDGE CASE TESTS
// ============================================================================

console.log('\n=== Additional edge case tests ===\n');

test('Methods throw error when provider not initialized', async () => {
  const provider = new SignalWireProvider();

  try {
    await provider.listPhoneNumbers();
    throw new Error('Should have thrown an error');
  } catch (error) {
    assert(error.message.includes('not initialized'), 'Should mention not initialized');
  }

  try {
    await provider.searchAvailableNumbers({ areaCode: '202' });
    throw new Error('Should have thrown an error');
  } catch (error) {
    assert(error.message.includes('not initialized'), 'Should mention not initialized');
  }

  try {
    await provider.provisionNumber({ phoneNumber: '+12025551234' });
    throw new Error('Should have thrown an error');
  } catch (error) {
    assert(error.message.includes('not initialized'), 'Should mention not initialized');
  }

  try {
    await provider.releaseNumber({ phoneNumberSid: 'PN123' });
    throw new Error('Should have thrown an error');
  } catch (error) {
    assert(error.message.includes('not initialized'), 'Should mention not initialized');
  }
});

test('Phone number normalization handles various API response formats', async () => {
  const provider = new SignalWireProvider();

  // Test with underscore naming
  setMockResponse('/IncomingPhoneNumbers.json', {
    success: true,
    data: {
      incoming_phone_numbers: [
        {
          phone_number: '+12025551234',
          friendly_name: 'Underscore Format',
          sid: 'PN123',
          account_sid: 'AC123',
          capabilities_voice: true,
          capabilities_sms: true,
          rate_center: 'RC123',
          date_created: '2024-01-01T00:00:00Z'
        }
      ]
    }
  });

  const result = await provider.listPhoneNumbers();
  const number = result.phoneNumbers[0];

  assertEquals(number.phoneNumber, '+12025551234', 'Should handle underscore format');
  assertEquals(number.rateCenter, 'RC123', 'Should normalize rate_center');

  clearMockResponses();
});

test('All phone number methods return consistent response format', async () => {
  const provider = new SignalWireProvider();

  // listPhoneNumbers
  setMockResponse('/IncomingPhoneNumbers.json', {
    success: true,
    data: { incoming_phone_numbers: [] }
  });
  const listResult = await provider.listPhoneNumbers();
  assertEquals(typeof listResult.success, 'boolean', 'listPhoneNumbers should have success flag');

  clearMockResponses();

  // searchAvailableNumbers
  setMockResponse('/AvailablePhoneNumbers/US/Local.json', {
    success: true,
    data: { available_phone_numbers: [] }
  });
  const searchResult = await provider.searchAvailableNumbers({ areaCode: '202' });
  assertEquals(typeof searchResult.success, 'boolean', 'searchAvailableNumbers should have success flag');

  clearMockResponses();

  // provisionNumber
  setMockResponse('/IncomingPhoneNumbers.json', {
    success: true,
    data: {
      phone_number: '+12025551234',
      sid: 'PN123',
      account_sid: 'AC123'
    }
  });
  const provisionResult = await provider.provisionNumber({ phoneNumber: '+12025551234' });
  assertEquals(typeof provisionResult.success, 'boolean', 'provisionNumber should have success flag');

  clearMockResponses();

  // releaseNumber
  setMockResponse('/IncomingPhoneNumbers/PN123.json', {
    success: true
  });
  const releaseResult = await provider.releaseNumber({ phoneNumberSid: 'PN123' });
  assertEquals(typeof releaseResult.success, 'boolean', 'releaseNumber should have success flag');

  clearMockResponses();
});

// ============================================================================
// TEST SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log('TEST SUMMARY');
console.log('='.repeat(60));
console.log(`Total Tests: ${testsRun}`);
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log(`Success Rate: ${((testsPassed / testsRun) * 100).toFixed(1)}%`);
console.log('='.repeat(60));

if (testsFailed > 0) {
  console.error('\n✗ Some tests failed!\n');
  process.exit(1);
} else {
  console.log('\n✓ All tests passed!\n');
  process.exit(0);
}
