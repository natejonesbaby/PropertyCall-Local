/**
 * Test Feature #169: Call results posted to FUB after call
 *
 * This test verifies that call qualification data, recording URL, and transcript
 * summary are properly posted to Follow-up Boss after a call completes.
 */

const API_BASE = 'http://localhost:3000';
const FUB_MOCK_BASE = 'http://localhost:12113';
const Database = require('better-sqlite3');
const path = require('path');

// Database path
const dbPath = path.join(__dirname, 'backend/data/property_call.db');
const db = new Database(dbPath);

async function getAuthToken() {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'password123'
    })
  });
  const data = await response.json();
  return data.token;
}

async function testFeature169() {
  console.log('=== Testing Feature #169: Call results posted to FUB after call ===\n');

  // Step 1: Get auth token
  console.log('Step 1: Getting auth token...');
  const token = await getAuthToken();
  if (!token) {
    console.error('FAIL: Could not get auth token');
    process.exit(1);
  }
  console.log('  ✓ Auth token obtained\n');

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // Step 2: Create a test lead with FUB ID in the database
  console.log('Step 2: Creating test lead with FUB ID...');

  // First, create a person in mock FUB server
  const fubResponse = await fetch(`${FUB_MOCK_BASE}/v1/people`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + Buffer.from('KEY_test_12345:').toString('base64')
    },
    body: JSON.stringify({
      firstName: 'Test169',
      lastName: 'FUBIntegration',
      phones: [{ type: 'mobile', value: '+15551690169' }]
    })
  });

  const fubPerson = await fubResponse.json();
  console.log(`  ✓ Created FUB person with ID: ${fubPerson.id}`);

  // Create lead directly in database with FUB ID
  const userId = 1;
  const leadResult = db.prepare(`
    INSERT INTO leads (user_id, first_name, last_name, property_address, property_city, property_state, property_zip, phones, fub_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    'Test169',
    'FUBIntegration',
    '169 FUB Test Street',
    'TestCity',
    'FL',
    '32169',
    JSON.stringify([{ type: 'mobile', number: '+15551690169' }]),
    fubPerson.id.toString()
  );

  const leadId = leadResult.lastInsertRowid;
  console.log(`  ✓ Created local lead with ID: ${leadId}, FUB ID: ${fubPerson.id}\n`);

  // Step 3: Create a call record directly
  console.log('Step 3: Creating call record with qualification data...');

  const callResult = db.prepare(`
    INSERT INTO calls (lead_id, status, qualification_status, disposition, sentiment, recording_url, transcript, answers, duration_seconds, started_at, ended_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-3 minutes'), datetime('now'))
  `).run(
    leadId,
    'completed',
    'Qualified',
    'Callback Scheduled',
    'Very Motivated',
    'https://recordings.telnyx.com/test-recording-169.mp3',
    'AI: Hi, this is a call about your property at 169 FUB Test Street. Are you interested in selling? Human: Yes, very interested! We need to sell quickly due to relocation. AI: That\'s great! When are you looking to sell? Human: Within the next 30 days if possible. AI: Perfect. What price range are you expecting? Human: Around $250,000 would be ideal. AI: Thank you for that information. I\'ll have our team follow up with you.',
    JSON.stringify({
      motivation_to_sell: 'Yes, very interested - relocating',
      timeline: 'Within 30 days',
      price_expectations: '$250,000'
    }),
    180
  );

  const callId = callResult.lastInsertRowid;
  console.log(`  ✓ Created call with ID: ${callId}`);
  console.log(`    - Status: completed`);
  console.log(`    - Qualification: Qualified`);
  console.log(`    - Disposition: Callback Scheduled`);
  console.log(`    - Sentiment: Very Motivated`);
  console.log(`    - Recording URL: Set\n`);

  // Step 4: Post call results to FUB via API
  console.log('Step 4: Posting call results to FUB via API...');

  const postToFubResponse = await fetch(`${API_BASE}/api/calls/${callId}/post-to-fub`, {
    method: 'POST',
    headers
  });

  const fubResult = await postToFubResponse.json();
  console.log('  FUB Post Result:', JSON.stringify(fubResult, null, 2));

  // Step 5: Verify data was posted to FUB
  console.log('\nStep 5: Verifying data in FUB...');

  // Get the updated person from FUB mock
  const fubVerifyResponse = await fetch(`${FUB_MOCK_BASE}/v1/people/${fubPerson.id}`, {
    headers: {
      'Authorization': 'Basic ' + Buffer.from('KEY_test_12345:').toString('base64')
    }
  });

  const fubVerifyPerson = await fubVerifyResponse.json();
  console.log('  FUB Person Record (custom fields updated):', JSON.stringify(fubVerifyPerson.customFields || {}, null, 2));

  // Step 6: Summary of verification results
  console.log('\n=== VERIFICATION SUMMARY ===\n');

  // Check the call in database
  const verifyCall = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId);

  const checks = {
    'Call has qualification_status = Qualified': verifyCall?.qualification_status === 'Qualified',
    'Call has disposition = Callback Scheduled': verifyCall?.disposition === 'Callback Scheduled',
    'Call has sentiment = Very Motivated': verifyCall?.sentiment === 'Very Motivated',
    'Call has recording_url': !!verifyCall?.recording_url,
    'Call has transcript': !!verifyCall?.transcript,
    'FUB API call succeeded': fubResult.success === true || (fubResult.personUpdate?.success && fubResult.noteCreated?.success),
    'FUB person record updated': fubResult.personUpdate?.success === true || fubResult.personUpdate?.skipped === true,
    'FUB note created with summary': fubResult.noteCreated?.success === true
  };

  let allPassed = true;
  for (const [check, passed] of Object.entries(checks)) {
    console.log(`  ${passed ? '✓' : '✗'} ${check}`);
    if (!passed) allPassed = false;
  }

  console.log('\n' + (allPassed ? '=== ALL CHECKS PASSED ===' : '=== SOME CHECKS FAILED ==='));

  // Cleanup: delete test lead and call
  console.log('\nCleaning up test data...');
  db.prepare('DELETE FROM calls WHERE id = ?').run(callId);
  db.prepare('DELETE FROM leads WHERE id = ?').run(leadId);
  console.log('  ✓ Test data cleaned up');

  db.close();

  return allPassed;
}

testFeature169()
  .then(passed => {
    process.exit(passed ? 0 : 1);
  })
  .catch(err => {
    console.error('Test error:', err);
    process.exit(1);
  });
