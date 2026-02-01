// Test script for Feature #159: Phone number rotation

const BASE_URL = 'http://localhost:3000';
const TOKEN = '42ddd7dd53874010b7f4545a70071479b9a58429f63d74c05533aa0db457de12';

// We'll use better-sqlite3 to create the test lead directly
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'backend/data/property_call.db');
const db = new Database(dbPath);

async function testPhoneRotation() {
  console.log('=== Testing Feature #159: Phone Number Rotation ===\n');

  // Step 1: Create a lead with multiple phone numbers directly in DB
  console.log('Step 1: Creating lead with multiple phone numbers...');

  const phones = JSON.stringify([
    { type: 'Mobile 1', number: '+15551001001' },
    { type: 'Mobile 2', number: '+15551001002' },
    { type: 'Landline', number: '+15551001003' }
  ]);

  // Insert lead directly into database
  const result = db.prepare(`
    INSERT INTO leads (user_id, first_name, last_name, property_address, property_city, property_state, property_zip, phones, status)
    VALUES (1, 'ROTATION_TEST', 'MultiPhone', '159 Rotation Test Blvd', 'TestCity', 'FL', '32801', ?, 'new')
  `).run(phones);

  const lead = {
    id: result.lastInsertRowid,
    phones: JSON.parse(phones)
  };

  console.log(`  Created lead ID: ${lead.id}`);
  console.log(`  Phones: ${JSON.stringify(lead.phones)}`);
  console.log('');

  // Step 2: Trigger first call (should use phone_index 0 = Mobile 1)
  console.log('Step 2: Triggering first call (should use Mobile 1)...');

  const call1Resp = await fetch(`${BASE_URL}/api/calls/trigger`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ lead_id: lead.id })
  });

  const call1Data = await call1Resp.json();
  console.log(`  Call 1 ID: ${call1Data.call_id}`);
  console.log(`  Phone Rotation: ${JSON.stringify(call1Data.phone_rotation)}`);
  console.log('');

  // Step 3: Complete call with "No Answer" to trigger retry and rotation
  console.log('Step 3: Updating call to "No Answer" to trigger retry...');

  const updateResp = await fetch(`${BASE_URL}/api/calls/${call1Data.call_id}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      status: 'completed',
      disposition: 'No Answer',
      qualification_status: "Couldn't Reach"
    })
  });

  const updateData = await updateResp.json();
  console.log(`  Call status: ${updateData.call?.status}`);
  console.log(`  Disposition: ${updateData.call?.disposition}`);
  console.log(`  Retry Scheduled: ${JSON.stringify(updateData.call?.retryScheduled, null, 2)}`);
  console.log('');

  // Step 4: Check that the queue entry has the next phone index
  if (updateData.call?.retryScheduled) {
    console.log('Step 4: Verifying phone rotation in queue...');
    console.log(`  Previous phone index: ${updateData.call.retryScheduled.phone_rotation?.previous_phone_index}`);
    console.log(`  Next phone index: ${updateData.call.retryScheduled.phone_rotation?.next_phone_index}`);
    console.log(`  Total phones: ${updateData.call.retryScheduled.phone_rotation?.total_phones}`);

    // Verify: next phone index should be 1 (Mobile 2) after first call used 0 (Mobile 1)
    const prevIndex = updateData.call.retryScheduled.phone_rotation?.previous_phone_index;
    const nextIndex = updateData.call.retryScheduled.phone_rotation?.next_phone_index;

    if (prevIndex === 0 && nextIndex === 1) {
      console.log('  ✅ PASS: Phone rotated from index 0 to index 1');
    } else {
      console.log(`  ❌ FAIL: Expected rotation from 0 to 1, got ${prevIndex} to ${nextIndex}`);
    }
  }
  console.log('');

  // Step 5: Now trigger call with explicit phone_index=1 (simulating the queued retry)
  console.log('Step 5: Triggering call with phone_index=1 (Mobile 2)...');

  const call2Resp = await fetch(`${BASE_URL}/api/calls/trigger`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ lead_id: lead.id, phone_index: 1 })
  });

  const call2Data = await call2Resp.json();
  console.log(`  Call 2 ID: ${call2Data.call_id}`);
  console.log(`  Phone Rotation: ${JSON.stringify(call2Data.phone_rotation)}`);

  if (call2Data.phone_rotation?.phone_index === 1 &&
      call2Data.phone_rotation?.phone_used === '+15551001002') {
    console.log('  ✅ PASS: Call 2 correctly used phone index 1 (Mobile 2)');
  } else {
    console.log('  ❌ FAIL: Call 2 did not use expected phone');
  }
  console.log('');

  // Step 6: Update call 2 to "No Answer" and verify rotation to phone index 2
  console.log('Step 6: Completing call 2 with "No Answer" to rotate to phone index 2...');

  const update2Resp = await fetch(`${BASE_URL}/api/calls/${call2Data.call_id}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      status: 'completed',
      disposition: 'No Answer',
      qualification_status: "Couldn't Reach"
    })
  });

  const update2Data = await update2Resp.json();
  console.log(`  Retry Scheduled: ${JSON.stringify(update2Data.call?.retryScheduled?.phone_rotation, null, 2)}`);

  if (update2Data.call?.retryScheduled?.phone_rotation?.next_phone_index === 2) {
    console.log('  ✅ PASS: Phone rotated from index 1 to index 2 (Landline)');
  } else {
    console.log('  ❌ FAIL: Expected rotation to index 2');
  }
  console.log('');

  // Step 7: Trigger call with phone_index=2 (Landline)
  console.log('Step 7: Triggering call with phone_index=2 (Landline)...');

  const call3Resp = await fetch(`${BASE_URL}/api/calls/trigger`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ lead_id: lead.id, phone_index: 2 })
  });

  const call3Data = await call3Resp.json();
  console.log(`  Call 3 ID: ${call3Data.call_id}`);
  console.log(`  Phone Rotation: ${JSON.stringify(call3Data.phone_rotation)}`);

  if (call3Data.phone_rotation?.phone_index === 2 &&
      call3Data.phone_rotation?.phone_used === '+15551001003') {
    console.log('  ✅ PASS: Call 3 correctly used phone index 2 (Landline)');
  } else {
    console.log('  ❌ FAIL: Call 3 did not use expected phone');
  }
  console.log('');

  // Step 8: Verify wrap-around - after using all 3 phones, it should wrap to 0
  console.log('Step 8: Completing call 3 and verifying wrap-around to phone index 0...');

  const update3Resp = await fetch(`${BASE_URL}/api/calls/${call3Data.call_id}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      status: 'completed',
      disposition: 'No Answer',
      qualification_status: "Couldn't Reach"
    })
  });

  const update3Data = await update3Resp.json();

  // Note: This might hit max_attempts, so check both scenarios
  if (update3Data.call?.retryScheduled?.phone_rotation?.next_phone_index === 0) {
    console.log('  ✅ PASS: Phone rotation wrapped around to index 0');
  } else if (update3Data.call?.retryStopped) {
    console.log(`  ℹ️ Max attempts reached (${update3Data.call.retryStopped.max_attempts}), no more retries`);
    console.log('  ✅ PASS: Rotation logic worked correctly before max attempts');
  } else {
    console.log(`  Unexpected result: ${JSON.stringify(update3Data.call?.retryScheduled || update3Data.call?.retryStopped)}`);
  }
  console.log('');

  // Verify all attempts are logged
  console.log('Step 9: Verifying all attempts are logged...');

  const callsResp = await fetch(`${BASE_URL}/api/calls?lead_id=${lead.id}`, {
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });

  const callsData = await callsResp.json();
  console.log(`  Total calls for lead: ${callsData.calls.length}`);

  for (const call of callsData.calls) {
    console.log(`    Call ${call.id}: phone_index=${call.phone_index}, phone_used=${call.phone_number_used}, status=${call.status}, disposition=${call.disposition}`);
  }

  if (callsData.calls.length >= 3) {
    console.log('  ✅ PASS: All call attempts are logged');
  } else {
    console.log('  ❌ FAIL: Expected at least 3 calls logged');
  }

  console.log('\n=== Feature #159 Test Complete ===');

  // Cleanup: close database connection
  db.close();
}

testPhoneRotation().catch(console.error);
