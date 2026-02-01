/**
 * Debug script to see what the duplicate check endpoint returns
 */

const API_BASE = 'http://localhost:3000/api';

async function login() {
  console.log('Logging in...');
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'password123'
    })
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.status}`);
  }

  const data = await response.json();
  console.log('  ✓ Logged in\n');
  return data.token;
}

async function testDuplicateCheck(importId, authToken) {
  console.log(`Testing duplicate check for import ${importId}...`);

  const response = await fetch(`${API_BASE}/import/check-duplicates/${importId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({ checkFub: true })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`  ✗ Failed: ${response.status}`);
    console.error(`  Error: ${errorText}`);
    return;
  }

  const data = await response.json();
  console.log('\n  Full response:');
  console.log(JSON.stringify(data, null, 2));
}

async function main() {
  try {
    const token = await login();
    // Use import ID 37 from the last test run
    await testDuplicateCheck(37, token);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
