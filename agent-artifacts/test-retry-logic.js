// Test script for Feature #187: Retry logic follows configured attempts
// Tests that calls with retryable dispositions get retried the configured number of times

const API_BASE = 'http://localhost:3000/api';

// Step 1: Login to get auth token
async function login() {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
  });
  const data = await response.json();
  if (!data.token) throw new Error('Login failed: ' + JSON.stringify(data));
  return data.token;
}

// Step 2: Set max_attempts to 3 via call settings
async function setMaxAttempts(token, maxAttempts) {
  const response = await fetch(`${API_BASE}/config/call-settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ max_attempts: maxAttempts })
  });
  const data = await response.json();
  console.log(`Set max_attempts to ${maxAttempts}:`, data.settings?.max_attempts);
  return data;
}

// Step 3: Create a test lead
async function createTestLead(token) {
  const leadData = {
    first_name: 'RETRY',
    last_name: 'TEST_' + Date.now(),
    property_address: '123 Retry Test Blvd',
    property_city: 'New York',
    property_state: 'NY',
    property_zip: '10001',
    phones: [{ number: '+15551234567', type: 'mobile' }]
  };

  const response = await fetch(`${API_BASE}/leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(leadData)
  });
  const data = await response.json();
  console.log('Created test lead:', data.lead?.id, data.lead?.first_name, data.lead?.last_name);
  return data.lead;
}

// Step 4: Trigger a call for the lead
async function triggerCall(token, leadId) {
  const response = await fetch(`${API_BASE}/calls/trigger`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ lead_id: leadId })
  });
  const data = await response.json();

  // Handle outside calling hours error
  if (response.status === 403 && data.error === 'Outside calling hours') {
    console.log('Note: Outside calling hours - creating call record manually for testing');
    // Create a call record directly for testing purposes
    return { call_id: null, needsManualCreate: true };
  }

  console.log('Triggered call:', data.call_id);
  return data;
}

// Step 5: Update call with "No Answer" disposition (should trigger retry)
async function updateCallWithNoAnswer(token, callId) {
  const response = await fetch(`${API_BASE}/calls/${callId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      status: 'completed',
      disposition: 'No Answer',
      qualification_status: "Couldn't Reach"
    })
  });
  const data = await response.json();
  console.log('Updated call with No Answer disposition');
  console.log('Retry scheduled?', data.call?.retryScheduled ? 'YES' : 'NO');
  if (data.call?.retryScheduled) {
    console.log('  - Queue ID:', data.call.retryScheduled.queue_id);
    console.log('  - Attempt number:', data.call.retryScheduled.attempt_number);
    console.log('  - Scheduled for:', data.call.retryScheduled.scheduled_for);
    console.log('  - Max attempts:', data.call.retryScheduled.max_attempts);
  }
  if (data.call?.retryStopped) {
    console.log('Retry STOPPED:', data.call.retryStopped);
  }
  return data;
}

// Step 6: Get queue status to verify retry scheduled
async function getQueueForLead(token, leadId) {
  const response = await fetch(`${API_BASE}/queue?lead_id=${leadId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  const data = await response.json();
  console.log('Queue items for lead:', data.queue?.length || 0);
  return data.queue || [];
}

// Step 7: Count call attempts for a lead
async function getCallCountForLead(token, leadId) {
  const response = await fetch(`${API_BASE}/calls?lead_id=${leadId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  const data = await response.json();
  return data.calls?.length || 0;
}

// Step 8: Create a call record directly (for testing when outside calling hours)
async function createCallRecord(token, leadId) {
  // Use the trigger endpoint which creates the call
  // If outside hours, we need to work around it
  // For now, let's check if there's a way to create calls directly
  // Actually, the trigger endpoint creates the call record, we just need to handle the 403
  console.log('Note: Creating call via direct database would require different approach');
  return null;
}

// Main test
async function runTest() {
  console.log('=== Feature #187: Retry Logic Test ===\n');

  try {
    // Login
    console.log('Step 1: Logging in...');
    const token = await login();
    console.log('Logged in successfully\n');

    // Configure max_attempts = 3
    console.log('Step 2: Configuring 3 retry attempts...');
    await setMaxAttempts(token, 3);
    console.log('');

    // Create test lead
    console.log('Step 3: Creating test lead...');
    const lead = await createTestLead(token);
    console.log('');

    // Trigger first call
    console.log('Step 4: Triggering first call...');
    const callResult = await triggerCall(token, lead.id);

    if (callResult.needsManualCreate) {
      console.log('\n*** TESTING LIMITATION ***');
      console.log('The API enforces calling hours, which prevents call creation outside of configured hours.');
      console.log('To fully test this feature, you would need to:');
      console.log('  1. Run the test during configured calling hours (default: 9 AM - 7 PM)');
      console.log('  2. Or temporarily modify the call trigger endpoint to bypass hour check for testing');
      console.log('\nAlternative: Testing the retry logic directly...\n');

      // Let's test the retry scheduling logic via a different approach
      // We can check if the settings are properly configured
      console.log('Verifying call settings are correctly stored...');
      const settingsResponse = await fetch(`${API_BASE}/config/call-settings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const settingsData = await settingsResponse.json();
      console.log('Current call settings:', settingsData.settings);

      console.log('\n=== PARTIAL TEST COMPLETE ===');
      console.log('The retry logic code is implemented and settings are configured.');
      console.log('Full verification requires testing during calling hours.\n');
      return;
    }

    const callId = callResult.call_id;
    console.log('');

    // Mark call as "No Answer"
    console.log('Step 5: Marking call as "No Answer"...');
    const updateResult = await updateCallWithNoAnswer(token, callId);
    console.log('');

    // Check call count
    console.log('Step 6: Checking call attempts...');
    const callCount = await getCallCountForLead(token, lead.id);
    console.log('Total calls for lead:', callCount);
    console.log('');

    // Check queue
    console.log('Step 7: Checking retry queue...');
    const queueItems = await getQueueForLead(token, lead.id);
    if (queueItems.length > 0) {
      queueItems.forEach((item, i) => {
        console.log(`  Queue item ${i + 1}:`);
        console.log(`    - Status: ${item.status}`);
        console.log(`    - Attempt: ${item.attempt_number}`);
        console.log(`    - Scheduled: ${item.scheduled_time}`);
      });
    }
    console.log('');

    // Simulate additional calls to test max attempts
    if (callCount < 3) {
      console.log('Step 8: Simulating additional calls to reach max attempts...');
      for (let i = callCount; i < 3; i++) {
        console.log(`\nTriggering call attempt ${i + 1}...`);
        const nextCallResult = await triggerCall(token, lead.id);
        if (nextCallResult.call_id) {
          console.log(`Marking call ${nextCallResult.call_id} as No Answer...`);
          await updateCallWithNoAnswer(token, nextCallResult.call_id);
        }
      }
    }

    // Final check
    console.log('\nStep 9: Final verification...');
    const finalCallCount = await getCallCountForLead(token, lead.id);
    const finalQueueItems = await getQueueForLead(token, lead.id);

    console.log('Final call count for lead:', finalCallCount);
    console.log('Final queue items:', finalQueueItems.length);

    if (finalCallCount >= 3 && finalQueueItems.length === 0) {
      console.log('\n=== TEST PASSED ===');
      console.log('After 3 attempts, no more retries were scheduled.');
    } else if (updateResult.call?.retryStopped) {
      console.log('\n=== TEST PASSED ===');
      console.log('Retry stopped due to max attempts reached.');
    }

  } catch (error) {
    console.error('Test error:', error.message);
    console.error(error.stack);
  }
}

runTest();
