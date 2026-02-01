/**
 * Test Feature #7: Session expires after 24 hours of inactivity
 *
 * Steps:
 * 1. Log in as valid user
 * 2. Note session token/cookie expiration
 * 3. Verify session expiration is set to 24 hours
 * 4. Simulate session expiration (mock time or check token)
 * 5. Attempt API call with expired session
 * 6. Verify 401 response and redirect to login
 */

const BASE_URL = 'http://localhost:3000';
const sqlite3 = require('better-sqlite3');
const path = require('path');

const db = sqlite3(path.join(__dirname, 'backend', 'data', 'property_call.db'));

async function testFeature7() {
  console.log('=== Feature #7 Test: Session expires after 24 hours ===\n');

  let passed = true;
  let token = null;

  // Step 1: Log in as valid user
  console.log('Step 1: Log in as valid user...');
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

    if (!loginResponse.ok || !loginData.token) {
      console.log('  ✗ FAIL: Could not log in');
      console.log('    Response:', loginData);
      passed = false;
      return;
    }

    token = loginData.token;
    console.log('  ✓ PASS: Logged in successfully');
    console.log(`    Token: ${token.substring(0, 20)}...`);
    console.log(`    Expires At: ${loginData.expiresAt}`);
  } catch (error) {
    console.log('  ✗ FAIL: Login error:', error.message);
    passed = false;
    return;
  }

  // Step 2 & 3: Verify session expiration is set to 24 hours
  console.log('\nStep 2 & 3: Verify session expiration is set to 24 hours...');
  try {
    // Check the session in the database
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(token);

    if (!session) {
      console.log('  ✗ FAIL: Session not found in database');
      passed = false;
    } else {
      const expiresAt = new Date(session.expires_at);
      const createdAt = new Date(session.created_at || Date.now());
      const now = new Date();

      // Calculate expiration from now (should be ~24 hours in the future)
      const hoursUntilExpiry = (expiresAt - now) / (1000 * 60 * 60);

      console.log(`    Session created: ${createdAt.toISOString()}`);
      console.log(`    Session expires: ${expiresAt.toISOString()}`);
      console.log(`    Hours until expiry: ${hoursUntilExpiry.toFixed(2)}`);

      // Should be close to 24 hours (within 1 minute tolerance for test execution time)
      if (hoursUntilExpiry >= 23.98 && hoursUntilExpiry <= 24.02) {
        console.log('  ✓ PASS: Session expiration is set to 24 hours');
      } else {
        console.log('  ✗ FAIL: Session expiration is not 24 hours');
        console.log(`    Expected: ~24 hours, Got: ${hoursUntilExpiry.toFixed(2)} hours`);
        passed = false;
      }
    }
  } catch (error) {
    console.log('  ✗ FAIL: Database check error:', error.message);
    passed = false;
  }

  // Step 4: Simulate session expiration
  console.log('\nStep 4: Simulate session expiration...');
  try {
    // Create an expired session by manually inserting one with past expiration
    const expiredToken = 'expired_test_token_' + Date.now();
    const pastDate = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago

    // Get a user ID to associate with the expired session
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();

    if (!user) {
      console.log('  ✗ FAIL: No users found to create test session');
      passed = false;
    } else {
      // Insert expired session
      db.prepare(`
        INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)
      `).run(expiredToken, user.id, pastDate.toISOString());

      console.log('  ✓ Created expired session for testing');
      console.log(`    Token: ${expiredToken}`);
      console.log(`    Expires at: ${pastDate.toISOString()} (in the past)`);

      // Step 5: Attempt API call with expired session
      console.log('\nStep 5: Attempt API call with expired session...');

      const expiredResponse = await fetch(`${BASE_URL}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${expiredToken}`
        }
      });

      const expiredData = await expiredResponse.json();

      // Step 6: Verify 401 response
      console.log('\nStep 6: Verify 401 response...');

      if (expiredResponse.status === 401) {
        console.log('  ✓ PASS: Got 401 Unauthorized for expired session');
        console.log(`    Status: ${expiredResponse.status}`);
        console.log(`    Message: ${expiredData.error}`);
      } else {
        console.log('  ✗ FAIL: Did not get 401 for expired session');
        console.log(`    Expected: 401, Got: ${expiredResponse.status}`);
        console.log(`    Response: ${JSON.stringify(expiredData)}`);
        passed = false;
      }

      // Clean up test expired session
      db.prepare('DELETE FROM sessions WHERE id = ?').run(expiredToken);
      console.log('\n  Cleaned up test expired session');
    }
  } catch (error) {
    console.log('  ✗ FAIL: Session expiration test error:', error.message);
    passed = false;
  }

  // Additional verification: Test that valid session still works
  console.log('\nBonus: Verify valid session still works...');
  try {
    const validResponse = await fetch(`${BASE_URL}/api/auth/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const validData = await validResponse.json();

    if (validResponse.ok && validData.user) {
      console.log('  ✓ PASS: Valid session still works correctly');
      console.log(`    User: ${validData.user.email}`);
    } else {
      console.log('  ✗ FAIL: Valid session should work');
      console.log(`    Response: ${JSON.stringify(validData)}`);
      passed = false;
    }
  } catch (error) {
    console.log('  ✗ FAIL: Valid session check error:', error.message);
    passed = false;
  }

  // Test protected endpoint with no token
  console.log('\nBonus: Test protected endpoint with no token...');
  try {
    const noTokenResponse = await fetch(`${BASE_URL}/api/leads`, {
      method: 'GET'
    });

    if (noTokenResponse.status === 401) {
      console.log('  ✓ PASS: Protected endpoint returns 401 without token');
    } else {
      console.log('  ✗ FAIL: Protected endpoint should require authentication');
      console.log(`    Expected: 401, Got: ${noTokenResponse.status}`);
      passed = false;
    }
  } catch (error) {
    console.log('  ✗ FAIL: No token test error:', error.message);
    passed = false;
  }

  console.log('\n=======================================================');
  if (passed) {
    console.log('✅ FEATURE #7 TEST PASSED: Session expires after 24 hours');
  } else {
    console.log('❌ FEATURE #7 TEST FAILED');
  }
  console.log('=======================================================\n');

  return passed;
}

testFeature7().catch(console.error);
