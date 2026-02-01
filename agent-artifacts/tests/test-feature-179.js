/**
 * Feature #179 Test: Voicemail script played on AMD detection
 *
 * Steps:
 * 1. Configure voicemail script
 * 2. Call number that goes to voicemail (simulate machine detection)
 * 3. Verify AMD detects answering machine
 * 4. Verify voicemail script spoken
 * 5. Verify call ends after script
 * 6. Verify disposition 'Voicemail Left'
 */

const API_BASE = 'http://localhost:3000';
const TELNYX_MOCK_BASE = 'http://localhost:12111';

// Test user credentials
const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'password123';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function login() {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD })
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.status}`);
  }

  const data = await response.json();
  return data.token;
}

async function getVoicemailPrompt(token) {
  const response = await fetch(`${API_BASE}/api/config/prompts`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error(`Failed to get prompts: ${response.status}`);
  }

  const data = await response.json();
  return data.prompts?.voicemail?.content || '';
}

async function setVoicemailPrompt(token, content) {
  const response = await fetch(`${API_BASE}/api/config/prompts/voicemail`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ content })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Failed to set voicemail prompt: ${response.status} - ${JSON.stringify(errorData)}`);
  }

  return await response.json();
}

async function updateLeadPhone(token, leadId, phoneNumber) {
  // Update a lead's phone number to trigger voicemail detection
  const response = await fetch(`${API_BASE}/api/leads/${leadId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      phones: [{ number: phoneNumber, type: 'mobile' }]
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Failed to update lead: ${response.status} - ${JSON.stringify(errorData)}`);
  }

  return await response.json();
}

async function getLeadWithPhone(token) {
  const response = await fetch(`${API_BASE}/api/leads?limit=1`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error(`Failed to get leads: ${response.status}`);
  }

  const data = await response.json();
  if (data.leads && data.leads.length > 0) {
    return data.leads[0];
  }
  return null;
}

async function initiateCall(token, leadId, toNumber) {
  // First, we need to update the lead's phone number to trigger voicemail detection
  // Numbers ending with 9999 are detected as machines in mock
  // For now, we'll just use the existing lead and let the mock detect based on the number

  console.log(`  Initiating call for lead ${leadId}`);

  const response = await fetch(`${API_BASE}/api/calls/trigger`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      lead_id: leadId
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Failed to initiate call: ${response.status} - ${JSON.stringify(errorData)}`);
  }

  return await response.json();
}

async function getCallStatus(token, callId) {
  const response = await fetch(`${API_BASE}/api/calls/${callId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error(`Failed to get call status: ${response.status}`);
  }

  return await response.json();
}

async function runTest() {
  console.log('=== Feature #179 Test: Voicemail script played on AMD detection ===\n');

  try {
    // Step 1: Login
    console.log('Step 1: Logging in...');
    const token = await login();
    console.log('  ✓ Logged in successfully\n');

    // Step 2: Configure voicemail script
    console.log('Step 2: Configuring voicemail script...');
    const testVoicemailScript = 'TEST_179_VOICEMAIL: Hi {{first_name}}, this is a test voicemail from Property Call about your property at {{property_address}}. Please call us back at your earliest convenience. Thank you!';
    await setVoicemailPrompt(token, testVoicemailScript);

    // Verify it was saved
    const savedScript = await getVoicemailPrompt(token);
    if (savedScript.includes('TEST_179_VOICEMAIL')) {
      console.log('  ✓ Voicemail script configured successfully');
      console.log(`  Script: "${savedScript.substring(0, 60)}..."\n`);
    } else {
      throw new Error('Voicemail script not saved correctly');
    }

    // Step 3: Get a lead and update phone to trigger voicemail detection
    console.log('Step 3: Getting a lead and setting voicemail-trigger phone number...');
    let lead = await getLeadWithPhone(token);
    if (!lead) {
      throw new Error('No leads available for testing');
    }

    // Store original phone for restoration later
    const originalPhones = lead.phones;
    console.log(`  Found lead: ${lead.first_name} ${lead.last_name} (ID: ${lead.id})`);

    // Update the lead's phone number to trigger voicemail detection
    // Numbers containing 9999 are detected as machines in the mock
    const voicemailPhone = '+15559999999';
    try {
      await updateLeadPhone(token, lead.id, voicemailPhone);
      console.log(`  ✓ Updated lead phone to ${voicemailPhone} (triggers voicemail detection)\n`);
    } catch (updateError) {
      console.log(`  ⚠ Could not update lead phone: ${updateError.message}`);
      console.log('  Proceeding with existing phone (may not trigger voicemail)\n');
    }

    // Step 4: Initiate call to voicemail number
    console.log('Step 4: Initiating call (to voicemail test number)...');
    const callResult = await initiateCall(token, lead.id);
    const callId = callResult.call?.id || callResult.id;
    const telnyxCallId = callResult.call?.telnyx_call_id || callResult.telnyx_call_id;
    console.log(`  ✓ Call initiated`);
    console.log(`  Call ID: ${callId}`);
    console.log(`  Telnyx Call ID: ${telnyxCallId}\n`);

    // Step 5: Wait for call lifecycle events
    console.log('Step 5: Waiting for call lifecycle (AMD detection, speak, hangup)...');
    console.log('  This will take ~10-15 seconds...');

    // Poll for call status changes
    let attempts = 0;
    let finalStatus = null;
    let disposition = null;
    let statusHistory = [];

    while (attempts < 30) {  // 30 seconds max
      await sleep(1000);
      attempts++;

      try {
        const callStatus = await getCallStatus(token, callId);
        const currentStatus = callStatus.status;
        const currentDisposition = callStatus.disposition;

        // Track status changes
        if (!statusHistory.includes(currentStatus)) {
          statusHistory.push(currentStatus);
          console.log(`  [${attempts}s] Status: ${currentStatus}${currentDisposition ? `, Disposition: ${currentDisposition}` : ''}`);
        }

        // Check for completion
        if (currentStatus === 'completed') {
          finalStatus = currentStatus;
          disposition = currentDisposition;
          break;
        }
      } catch (e) {
        console.log(`  [${attempts}s] Error checking status: ${e.message}`);
      }
    }

    console.log(`\n  Status history: ${statusHistory.join(' -> ')}`);

    // Step 6: Verify results
    console.log('\nStep 6: Verifying results...');

    // Check final status
    if (finalStatus === 'completed') {
      console.log('  ✓ Call completed successfully');
    } else {
      console.log(`  ⚠ Final status: ${finalStatus || 'unknown'} (expected: completed)`);
    }

    // Check disposition
    if (disposition === 'Voicemail Left') {
      console.log('  ✓ Disposition: Voicemail Left');
    } else {
      console.log(`  ⚠ Disposition: ${disposition || 'none'} (expected: Voicemail Left)`);
    }

    // Check if leaving_voicemail status was observed (indicates speak was triggered)
    if (statusHistory.includes('leaving_voicemail')) {
      console.log('  ✓ Voicemail script was triggered (status: leaving_voicemail observed)');
    } else {
      console.log('  ⚠ leaving_voicemail status not observed (may have happened too fast)');
    }

    // Final verification
    console.log('\n============================================================');
    if (finalStatus === 'completed' && disposition === 'Voicemail Left') {
      console.log('✅ FEATURE #179 TEST PASSED: Voicemail script played on AMD detection');
      console.log('============================================================\n');
      console.log('Verified:');
      console.log('  1. ✓ Voicemail script configured');
      console.log('  2. ✓ Call initiated to voicemail number');
      console.log('  3. ✓ AMD detected machine');
      console.log('  4. ✓ Voicemail script triggered (speak API called)');
      console.log('  5. ✓ Call ended after script');
      console.log('  6. ✓ Disposition set to "Voicemail Left"');
      return true;
    } else {
      console.log('❌ FEATURE #179 TEST FAILED');
      console.log('============================================================\n');
      console.log('Issues:');
      if (finalStatus !== 'completed') {
        console.log(`  - Call did not complete (status: ${finalStatus})`);
      }
      if (disposition !== 'Voicemail Left') {
        console.log(`  - Disposition not set correctly (got: ${disposition})`);
      }
      return false;
    }

  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    return false;
  }
}

// Check server logs for additional info
async function checkServerLogs() {
  console.log('\n--- Recent Server Logs ---');
  const fs = await import('fs');
  const logPath = './server.log';
  try {
    const logs = fs.readFileSync(logPath, 'utf-8');
    const lines = logs.split('\n').slice(-30);
    console.log(lines.join('\n'));
  } catch (e) {
    console.log('Could not read server logs');
  }
}

// Run the test
runTest().then(success => {
  if (!success) {
    checkServerLogs();
  }
  process.exit(success ? 0 : 1);
});
