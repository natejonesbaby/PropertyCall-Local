/**
 * Test Feature #171: Calling pauses when FUB API is down
 *
 * Steps:
 * 1. Simulate FUB API down (stop mock server or use invalid key)
 * 2. Verify health check shows FUB 'Disconnected'
 * 3. Verify call queue pauses automatically
 * 4. Verify alert shown about FUB connection issue
 * 5. Restore FUB connection, verify calling resumes
 */

const API_BASE = 'http://localhost:3000/api';
const FUB_MOCK_BASE = 'http://localhost:12113';

async function login() {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
  });
  const data = await response.json();
  return data.token;
}

async function getHealthStatus(token) {
  const response = await fetch(`${API_BASE}/settings/health`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return response.json();
}

async function getQueueStatus(token) {
  const response = await fetch(`${API_BASE}/queue/status`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return response.json();
}

async function saveApiKey(token, service, apiKey) {
  const response = await fetch(`${API_BASE}/settings/api-keys/${service}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ apiKey })
  });
  return response.json();
}

async function resumeQueue(token) {
  const response = await fetch(`${API_BASE}/queue/resume`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return response.json();
}

async function clearPauseReason(token) {
  // This clears any existing pause reason so we can test fresh
  // We'll do this by calling resume
  return resumeQueue(token);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('=== Feature #171 Test: Calling pauses when FUB API is down ===\n');

  // Login
  console.log('Step 0: Logging in...');
  const token = await login();
  if (!token) {
    console.error('  ✗ Failed to login');
    process.exit(1);
  }
  console.log('  ✓ Logged in successfully\n');

  // First, ensure queue is not paused and FUB is connected
  console.log('Step 0.5: Ensuring clean state...');
  await clearPauseReason(token);

  // Set a valid FUB API key (mock server accepts keys starting with KEY or MOCK_ or >= 20 chars)
  // Settings validation requires: alphanumeric only, >= 10 chars
  // So we use 20+ alphanumeric chars to pass both validations
  await saveApiKey(token, 'followupboss', 'KEYvalidtestapikeyabc');
  console.log('  ✓ Set valid FUB API key\n');

  // Verify FUB is connected initially
  console.log('Step 1: Verifying initial FUB connection...');
  let healthData = await getHealthStatus(token);
  console.log(`  FUB status: ${healthData.health?.followupboss?.status}`);
  console.log(`  Queue paused: ${healthData.queueStatus?.paused}`);
  console.log(`  Queue pause reason: ${healthData.queueStatus?.pausedReason || 'none'}`);

  if (healthData.health?.followupboss?.status !== 'connected') {
    console.error('  ✗ FUB should be connected initially');
    process.exit(1);
  }
  console.log('  ✓ FUB is connected\n');

  // Step 1: Simulate FUB API down by using an invalid API key
  console.log('Step 2: Simulating FUB API down (setting invalid key)...');
  // Use a key that:
  // - Passes settings validation: >= 10 chars, alphanumeric only
  // - Fails mock server: doesn't start with KEY or MOCK_, and is < 20 chars
  // So we use: 15 alphanumeric chars not starting with KEY or MOCK_
  await saveApiKey(token, 'followupboss', 'badkey12345abcd');
  console.log('  ✓ Invalid API key set\n');

  // Step 2: Verify health check shows FUB 'Disconnected'
  console.log('Step 3: Checking health status after FUB "down"...');
  healthData = await getHealthStatus(token);
  console.log(`  FUB status: ${healthData.health?.followupboss?.status}`);
  console.log(`  FUB message: ${healthData.health?.followupboss?.message}`);

  if (healthData.health?.followupboss?.status !== 'invalid_credentials' &&
      healthData.health?.followupboss?.status !== 'error') {
    console.error('  ✗ FUB should show as disconnected/error');
    process.exit(1);
  }
  console.log('  ✓ FUB shows as disconnected\n');

  // Step 3: Verify call queue pauses automatically
  console.log('Step 4: Verifying queue auto-paused...');
  console.log(`  Queue paused: ${healthData.queueStatus?.paused}`);
  console.log(`  Queue pause reason: ${healthData.queueStatus?.pausedReason}`);
  console.log(`  Queue auto action: ${healthData.queueStatus?.autoAction}`);

  if (healthData.queueStatus?.paused !== true) {
    console.error('  ✗ Queue should be paused');
    process.exit(1);
  }
  if (healthData.queueStatus?.pausedReason !== 'fub_outage') {
    console.error('  ✗ Queue pause reason should be "fub_outage"');
    process.exit(1);
  }
  console.log('  ✓ Queue auto-paused due to FUB outage\n');

  // Verify via queue status endpoint as well
  const queueStatus = await getQueueStatus(token);
  console.log(`  Queue status API confirms paused: ${queueStatus.paused}`);
  if (!queueStatus.paused) {
    console.error('  ✗ Queue status endpoint should also show paused');
    process.exit(1);
  }
  console.log('  ✓ Queue status endpoint confirms pause\n');

  // Step 5: Restore FUB connection
  console.log('Step 5: Restoring FUB connection (setting valid key)...');
  // Use 20+ alphanumeric chars to pass both validations
  await saveApiKey(token, 'followupboss', 'KEYrestoredvalidkey12');
  console.log('  ✓ Valid API key restored\n');

  // Verify calling resumes
  console.log('Step 6: Verifying queue auto-resumed...');
  healthData = await getHealthStatus(token);
  console.log(`  FUB status: ${healthData.health?.followupboss?.status}`);
  console.log(`  Queue paused: ${healthData.queueStatus?.paused}`);
  console.log(`  Queue pause reason: ${healthData.queueStatus?.pausedReason || 'none'}`);
  console.log(`  Queue auto action: ${healthData.queueStatus?.autoAction}`);

  if (healthData.health?.followupboss?.status !== 'connected') {
    console.error('  ✗ FUB should be connected after restore');
    process.exit(1);
  }
  if (healthData.queueStatus?.paused !== false) {
    console.error('  ✗ Queue should be resumed');
    process.exit(1);
  }
  if (healthData.queueStatus?.autoAction !== 'resumed') {
    console.error('  ✗ Auto action should be "resumed"');
    process.exit(1);
  }
  console.log('  ✓ Queue auto-resumed after FUB restored\n');

  // Final verification via queue status endpoint
  const finalQueueStatus = await getQueueStatus(token);
  console.log(`  Final queue status: paused=${finalQueueStatus.paused}`);
  if (finalQueueStatus.paused) {
    console.error('  ✗ Queue should not be paused after restore');
    process.exit(1);
  }
  console.log('  ✓ Queue is running\n');

  console.log('============================================================');
  console.log('✅ FEATURE #171 TEST PASSED: Calling pauses when FUB API is down');
  console.log('============================================================\n');

  console.log('Verified:');
  console.log('  1. ✓ FUB API down simulation (invalid key)');
  console.log('  2. ✓ Health check shows FUB disconnected');
  console.log('  3. ✓ Call queue auto-paused');
  console.log('  4. ✓ Pause reason tracked as "fub_outage"');
  console.log('  5. ✓ FUB connection restored');
  console.log('  6. ✓ Call queue auto-resumed');
}

runTest().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
