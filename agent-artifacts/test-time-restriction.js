// Test time-of-day restriction feature
const API_BASE = 'http://localhost:3000/api';

async function test() {
  // Login
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  console.log('Logged in successfully');

  // Get current settings
  const settingsRes = await fetch(`${API_BASE}/config/call-settings`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const settings = await settingsRes.json();
  console.log('\nCurrent Call Settings:', JSON.stringify(settings.settings, null, 2));

  // Get lead 1 details
  const leadRes = await fetch(`${API_BASE}/leads/1`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const lead = await leadRes.json();
  console.log('\nLead #1 State:', lead.property_state);

  // Get a California lead (Pacific timezone)
  const caLeadRes = await fetch(`${API_BASE}/leads?search=TEST_CA_LEAD`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const caLeadData = await caLeadRes.json();
  const caLead = caLeadData.leads?.[0];
  if (caLead) {
    console.log('\nCA Lead ID:', caLead.id, '- State:', caLead.property_state);
  }

  // Show current time in different timezones
  const now = new Date();
  console.log('\n--- Current Time in Different Timezones ---');
  console.log('UTC:', now.toISOString());
  console.log('Eastern (NY):', now.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false }));
  console.log('Pacific (LA):', now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour12: false }));

  // Test 1: Try to call Eastern timezone lead (should fail if after 7pm ET)
  console.log('\n--- Test 1: Calling Eastern timezone lead (ID: 1) ---');
  const trigger1Res = await fetch(`${API_BASE}/calls/trigger`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ lead_id: 1 })
  });
  const trigger1Data = await trigger1Res.json();
  console.log('Status:', trigger1Res.status);
  console.log('Response:', JSON.stringify(trigger1Data, null, 2));

  // Test 2: Try to call Pacific timezone lead (should succeed if before 7pm PT)
  if (caLead) {
    console.log('\n--- Test 2: Calling Pacific timezone lead (ID:', caLead.id, ') ---');
    const trigger2Res = await fetch(`${API_BASE}/calls/trigger`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ lead_id: caLead.id })
    });
    const trigger2Data = await trigger2Res.json();
    console.log('Status:', trigger2Res.status);
    console.log('Response:', JSON.stringify(trigger2Data, null, 2));

    // If call started, end it
    if (trigger2Data.call_id) {
      console.log('\nEnding the test call...');
      await fetch(`${API_BASE}/calls/${trigger2Data.call_id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'completed', disposition: 'No Answer' })
      });
      console.log('Call ended.');
    }
  }

  // Test 3: Change end time to be in the past (e.g., 14:00) and try again
  console.log('\n--- Test 3: Setting end_time to 14:00 (past current time) ---');
  const updateRes = await fetch(`${API_BASE}/config/call-settings`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ end_time: '14:00' })
  });
  const updateData = await updateRes.json();
  console.log('Settings updated:', JSON.stringify(updateData.settings, null, 2));

  // Now try to call the CA lead again (should be blocked)
  if (caLead) {
    console.log('\n--- Test 4: Calling CA lead with restrictive hours (should fail) ---');
    const trigger3Res = await fetch(`${API_BASE}/calls/trigger`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ lead_id: caLead.id })
    });
    const trigger3Data = await trigger3Res.json();
    console.log('Status:', trigger3Res.status);
    console.log('Response:', JSON.stringify(trigger3Data, null, 2));
  }

  // Restore original settings
  console.log('\n--- Restoring original end_time to 19:00 ---');
  await fetch(`${API_BASE}/config/call-settings`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ end_time: '19:00' })
  });
  console.log('Settings restored.');

  console.log('\n=== TIME RESTRICTION TEST COMPLETE ===');
}

test().catch(console.error);
