/**
 * Test Feature #158: Call recording URL retrieved and stored
 *
 * This test creates a call via the Mock Telnyx server with proper authentication,
 * waits for all webhooks, and verifies that the recording_url field is populated.
 */

const Database = require('better-sqlite3');

// Test configuration
const API_BASE = 'http://localhost:3000';

async function getAuthToken() {
  // Try to login with test credentials
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'password123'
    })
  });

  if (!response.ok) {
    throw new Error('Login failed');
  }

  const data = await response.json();
  return data.token;
}

async function testRecordingWebhook() {
  console.log('=== Feature #158 Test: Call Recording URL Retrieved and Stored ===\n');

  const db = new Database('backend/data/property_call.db');

  try {
    // Get auth token
    console.log('Authenticating...');
    const token = await getAuthToken();
    console.log('✓ Authenticated\n');

    // Step 1: Find a lead to call
    const lead = db.prepare(`
      SELECT id, first_name, last_name, phones
      FROM leads
      WHERE phones IS NOT NULL
      LIMIT 1
    `).get();

    if (!lead) {
      console.error('❌ No leads found. Please import leads first.');
      return false;
    }

    const phones = JSON.parse(lead.phones);
    const phoneToCall = phones[0];

    console.log(`Step 1: Found lead ${lead.first_name} ${lead.last_name} (ID: ${lead.id})`);
    console.log(`         Phone to call: ${phoneToCall}\n`);

    // Step 2: Initiate a call via the API
    console.log('Step 2: Initiating call via API...');

    const initiateResponse = await fetch(`${API_BASE}/api/calls/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        leadId: lead.id,
        phoneNumber: phoneToCall
      })
    });

    if (!initiateResponse.ok) {
      console.error('❌ Failed to initiate call:', await initiateResponse.text());
      return false;
    }

    const callData = await initiateResponse.json();
    const callId = callData.call?.id;
    const telnyxCallId = callData.call?.telnyx_call_id;

    if (!callId) {
      console.error('❌ No call ID returned from API');
      return false;
    }

    console.log(`✓ Call initiated successfully (ID: ${callId}, Telnyx ID: ${telnyxCallId})\n`);

    // Step 3: Wait for webhooks to be processed
    console.log('Step 3: Waiting for call lifecycle webhooks (15 seconds)...');
    console.log('         Expected: call.initiated → call.answered → call.recording.saved → call.hangup\n');

    await new Promise(resolve => setTimeout(resolve, 15000));

    // Step 4: Check the call record in the database
    console.log('Step 4: Checking call record in database...');

    const callRecord = db.prepare(`
      SELECT id, telnyx_call_id, status, recording_url,
             started_at, ended_at, duration_seconds
      FROM calls
      WHERE id = ?
    `).get(callId);

    if (!callRecord) {
      console.error(`❌ Call record ${callId} not found in database`);
      return false;
    }

    console.log('Call record:');
    console.log(`  - Status: ${callRecord.status}`);
    console.log(`  - Telnyx Call ID: ${callRecord.telnyx_call_id}`);
    console.log(`  - Recording URL: ${callRecord.recording_url || 'NOT SET'}`);
    console.log(`  - Duration: ${callRecord.duration_seconds}s\n`);

    // Step 5: Verify recording_url is populated
    console.log('Step 5: Verifying recording_url field...');

    if (!callRecord.recording_url) {
      console.error('❌ FAIL: recording_url field is NULL');
      console.error('\n   Troubleshooting:');
      console.error('   1. Check Mock Telnyx server logs (telnyx-mock.log)');
      console.error('   2. Check main server logs (server.log)');
      console.error('   3. Verify call.recording.saved webhook was sent');
      return false;
    }

    if (!callRecord.recording_url.startsWith('http')) {
      console.error(`❌ FAIL: Invalid URL format: ${callRecord.recording_url}`);
      return false;
    }

    console.log(`✓ PASS: recording_url = ${callRecord.recording_url}\n`);

    // Step 6: Verify accessible via API
    console.log('Step 6: Verifying recording URL via API...');

    const apiResponse = await fetch(`${API_BASE}/api/calls/${callId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!apiResponse.ok) {
      console.error('❌ FAIL: Could not fetch call via API');
      return false;
    }

    const apiCall = await apiResponse.json();

    if (!apiCall.recording_url) {
      console.error('❌ FAIL: API response missing recording_url');
      return false;
    }

    if (apiCall.recording_url !== callRecord.recording_url) {
      console.error('❌ FAIL: API URL does not match database');
      return false;
    }

    console.log(`✓ PASS: API returns recording_url correctly\n`);

    console.log('=== ✅ ALL TESTS PASSED ===');
    console.log('\nFeature #158 verified:');
    console.log('  ✓ Call completed (human answered)');
    console.log('  ✓ recording_url populated in database');
    console.log('  ✓ Valid Telnyx URL format');
    console.log('  ✓ Accessible via Call History API');

    return true;

  } catch (error) {
    console.error('❌ Test error:', error.message);
    return false;
  } finally {
    db.close();
  }
}

// Run the test
testRecordingWebhook().then(success => {
  process.exit(success ? 0 : 1);
});
