/**
 * Extended Test Feature #7: Session expires after 24 hours of inactivity
 *
 * Additional edge case testing
 */

const BASE_URL = 'http://localhost:3000';

async function testFeature7Extended() {
  console.log('=== Feature #7 Extended Tests ===\n');

  let passed = true;

  // Test 1: Login and verify expiration in response
  console.log('Test 1: Login and verify expiration time in response...');
  try {
    const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123'
      })
    });

    const loginData = await loginResponse.json();

    if (!loginData.expiresAt) {
      console.log('  ✗ FAIL: Login response missing expiresAt');
      passed = false;
    } else {
      const expiresAt = new Date(loginData.expiresAt);
      const now = new Date();
      const hoursUntilExpiry = (expiresAt - now) / (1000 * 60 * 60);

      if (hoursUntilExpiry >= 23.9 && hoursUntilExpiry <= 24.1) {
        console.log('  ✓ PASS: Login response includes correct expiresAt');
        console.log(`    Expires: ${loginData.expiresAt}`);
        console.log(`    Hours until expiry: ${hoursUntilExpiry.toFixed(2)}`);
      } else {
        console.log('  ✗ FAIL: expiresAt is not ~24 hours');
        console.log(`    Got: ${hoursUntilExpiry.toFixed(2)} hours`);
        passed = false;
      }
    }
  } catch (error) {
    console.log('  ✗ FAIL:', error.message);
    passed = false;
  }

  // Test 2: Verify token format is a hex string
  console.log('\nTest 2: Verify token format...');
  try {
    const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123'
      })
    });

    const loginData = await loginResponse.json();
    const token = loginData.token;

    // Token should be 64 hex characters (32 bytes as hex)
    const isValidHex = /^[a-f0-9]{64}$/i.test(token);

    if (isValidHex) {
      console.log('  ✓ PASS: Token is a 64-character hex string');
      console.log(`    Token length: ${token.length}`);
    } else {
      console.log('  ✗ FAIL: Token format is unexpected');
      console.log(`    Token: ${token}`);
      passed = false;
    }
  } catch (error) {
    console.log('  ✗ FAIL:', error.message);
    passed = false;
  }

  // Test 3: Multiple protected endpoints require auth
  console.log('\nTest 3: Multiple protected endpoints require auth...');
  const protectedEndpoints = [
    '/api/leads',
    '/api/calls',
    '/api/queue',
    '/api/config',
    '/api/dashboard/stats'
  ];

  for (const endpoint of protectedEndpoints) {
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'GET'
      });

      if (response.status === 401) {
        console.log(`  ✓ ${endpoint}: 401 Unauthorized`);
      } else {
        console.log(`  ✗ ${endpoint}: Expected 401, got ${response.status}`);
        passed = false;
      }
    } catch (error) {
      console.log(`  ✗ ${endpoint}: Error - ${error.message}`);
      passed = false;
    }
  }

  // Test 4: Valid token accesses protected endpoints
  console.log('\nTest 4: Valid token accesses protected endpoints...');
  try {
    const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123'
      })
    });
    const { token } = await loginResponse.json();

    for (const endpoint of ['/api/leads', '/api/auth/me']) {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        console.log(`  ✓ ${endpoint}: Accessible with valid token`);
      } else {
        console.log(`  ✗ ${endpoint}: Expected 200, got ${response.status}`);
        passed = false;
      }
    }
  } catch (error) {
    console.log('  ✗ FAIL:', error.message);
    passed = false;
  }

  // Test 5: Invalid token format returns 401
  console.log('\nTest 5: Invalid token format returns 401...');
  const invalidTokens = [
    'invalid-token',
    '12345',
    '',
    'Bearer ',
    null
  ];

  for (const invalidToken of invalidTokens) {
    try {
      const headers = invalidToken !== null
        ? { 'Authorization': `Bearer ${invalidToken}` }
        : {};

      const response = await fetch(`${BASE_URL}/api/auth/me`, {
        method: 'GET',
        headers
      });

      if (response.status === 401) {
        console.log(`  ✓ Invalid token "${invalidToken?.substring(0, 20) || '(none)'}" returns 401`);
      } else {
        console.log(`  ✗ Invalid token should return 401, got ${response.status}`);
        passed = false;
      }
    } catch (error) {
      console.log(`  ✗ Error testing invalid token: ${error.message}`);
      passed = false;
    }
  }

  // Test 6: Registration also returns 24-hour token
  console.log('\nTest 6: Registration returns 24-hour token...');
  try {
    const uniqueEmail = `test_session_${Date.now()}@example.com`;
    const regResponse = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: uniqueEmail,
        password: 'password123',
        confirmPassword: 'password123'
      })
    });

    const regData = await regResponse.json();

    if (regData.expiresAt && regData.token) {
      const expiresAt = new Date(regData.expiresAt);
      const now = new Date();
      const hoursUntilExpiry = (expiresAt - now) / (1000 * 60 * 60);

      if (hoursUntilExpiry >= 23.9 && hoursUntilExpiry <= 24.1) {
        console.log('  ✓ PASS: Registration returns 24-hour session');
      } else {
        console.log(`  ✗ FAIL: Registration session not 24 hours (${hoursUntilExpiry.toFixed(2)}h)`);
        passed = false;
      }
    } else {
      console.log('  ✗ FAIL: Registration response missing token or expiresAt');
      passed = false;
    }
  } catch (error) {
    console.log('  ✗ FAIL:', error.message);
    passed = false;
  }

  console.log('\n=======================================================');
  if (passed) {
    console.log('✅ ALL EXTENDED TESTS PASSED');
  } else {
    console.log('❌ SOME TESTS FAILED');
  }
  console.log('=======================================================\n');

  return passed;
}

testFeature7Extended().catch(console.error);
