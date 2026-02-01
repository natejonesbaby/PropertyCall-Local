/**
 * Test Script for Feature #170: Duplicate detection checks FUB by phone
 *
 * This script tests that:
 * 1. Create lead in FUB with phone 555-111-2222
 * 2. Upload XLSX with same phone number
 * 3. Run duplicate check
 * 4. Verify duplicate detected by phone match
 * 5. Verify FUB record link provided
 */

const API_BASE = 'http://localhost:3000/api';
const FUB_MOCK_BASE = 'http://127.0.0.1:12113';
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Test phone number
const TEST_PHONE = '555-111-2222';
const TEST_PHONE_NORMALIZED = '(555) 111-2222';
const TEST_PHONE_FUB_FORMAT = '5551112222';

// Auth token for API calls
let authToken = '';

async function login() {
  console.log('Step 0: Logging in...');
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
  authToken = data.token;
  console.log('  ✓ Logged in successfully\n');
  return data;
}

async function resetFubMock() {
  console.log('Resetting FUB mock server...');
  const response = await fetch(`${FUB_MOCK_BASE}/v1/_reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    console.log('  ⚠ Could not reset FUB mock (may not be running)');
    return false;
  }

  console.log('  ✓ FUB mock data reset\n');
  return true;
}

async function createPersonInFub() {
  console.log('Step 1: Create lead in FUB with phone 555-111-2222...');

  const fubApiKey = 'KEY_test_feature_170';
  const authHeader = 'Basic ' + Buffer.from(fubApiKey + ':').toString('base64');

  const person = {
    firstName: 'FUB_TEST',
    lastName: 'Feature170',
    phones: [{ value: TEST_PHONE, type: 'mobile' }],
    addresses: [{
      street: '170 FUB Test Street',
      city: 'FUBCity',
      state: 'FL',
      code: '32801'
    }]
  };

  const response = await fetch(`${FUB_MOCK_BASE}/v1/people`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader
    },
    body: JSON.stringify(person)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create FUB person: ${response.status} - ${errorText}`);
  }

  const fubPerson = await response.json();
  console.log(`  ✓ Created person in FUB: ID ${fubPerson.id}, Name: ${fubPerson.fullName}`);
  console.log(`  ✓ Phone: ${fubPerson.phones[0].value}`);
  console.log(`  ✓ Expected FUB Link: https://app.followupboss.com/2/people/view/${fubPerson.id}\n`);

  return fubPerson;
}

async function verifyFubPhoneSearch() {
  console.log('Verifying FUB phone search works...');

  const fubApiKey = 'KEY_test_feature_170';
  const authHeader = 'Basic ' + Buffer.from(fubApiKey + ':').toString('base64');

  const response = await fetch(`${FUB_MOCK_BASE}/v1/people?phone=${TEST_PHONE_FUB_FORMAT}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader
    }
  });

  if (!response.ok) {
    throw new Error(`FUB phone search failed: ${response.status}`);
  }

  const data = await response.json();
  if (data.people && data.people.length > 0) {
    console.log(`  ✓ FUB phone search found ${data.people.length} person(s)`);
    console.log(`  ✓ First match: ${data.people[0].fullName} (ID: ${data.people[0].id})\n`);
    return data.people[0];
  } else {
    throw new Error('FUB phone search returned no results');
  }
}

function createTestXlsx() {
  console.log('Step 2: Creating XLSX with same phone number...');

  const data = [
    {
      'First Name': 'XLSX_DUPLICATE',
      'Last Name': 'Feature170Test',
      'Mobile 1': TEST_PHONE, // Same phone as FUB person
      'Property Address': '170 Test Import Street',
      'Property City': 'ImportCity',
      'Property State': 'FL',
      'Property Zip': '32802'
    }
  ];

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Leads');

  const testFilePath = path.join(__dirname, 'test-files', 'feature-170-duplicate.xlsx');
  XLSX.writeFile(wb, testFilePath);

  console.log(`  ✓ Created test XLSX: ${testFilePath}`);
  console.log(`  ✓ Contains lead with phone: ${TEST_PHONE}\n`);

  return testFilePath;
}

async function uploadXlsx(filePath) {
  console.log('Uploading XLSX file...');

  const formData = new FormData();
  const fileContent = fs.readFileSync(filePath);
  const blob = new Blob([fileContent], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  formData.append('file', blob, 'feature-170-duplicate.xlsx');

  const response = await fetch(`${API_BASE}/import/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`
    },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log(`  ✓ File uploaded successfully`);
  console.log(`  ✓ Import ID: ${data.importId}`);
  console.log(`  ✓ Total rows: ${data.totalRows}\n`);

  return data;
}

async function checkDuplicates(importId) {
  console.log('Step 3: Running duplicate check...');

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
    throw new Error(`Duplicate check failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log(`  ✓ Duplicate check completed`);
  console.log(`  ✓ Total rows: ${data.totalRows}`);
  console.log(`  ✓ Duplicates found: ${data.duplicateCount}`);
  console.log(`  ✓ New leads: ${data.newLeadCount}`);
  console.log(`  ✓ FUB check enabled: ${data.fubCheckEnabled}`);
  console.log(`  ✓ FUB duplicates: ${data.fubDuplicateCount}`);
  console.log(`  ✓ Local duplicates: ${data.localDuplicateCount}\n`);

  return data;
}

async function verifyDuplicateDetails(duplicateData, fubPersonId) {
  console.log('Step 4: Verifying duplicate detected by phone match...');

  if (duplicateData.duplicateCount === 0) {
    throw new Error('No duplicates detected! Expected 1 duplicate from FUB phone match.');
  }

  const duplicate = duplicateData.duplicates[0];

  // Check match type is phone
  if (duplicate.matchType !== 'phone') {
    throw new Error(`Expected matchType 'phone', got '${duplicate.matchType}'`);
  }
  console.log(`  ✓ Match type: ${duplicate.matchType}`);

  // Check match source is fub
  if (duplicate.matchSource !== 'fub') {
    throw new Error(`Expected matchSource 'fub', got '${duplicate.matchSource}'`);
  }
  console.log(`  ✓ Match source: ${duplicate.matchSource}`);

  // Verify the uploaded lead info
  console.log(`  ✓ Uploaded lead name: ${duplicate.uploadedLead.name}`);
  console.log(`  ✓ Uploaded lead phone: ${duplicate.uploadedLead.phones.join(', ')}`);

  // Verify the existing (FUB) lead info
  console.log(`  ✓ Existing lead name: ${duplicate.existingLead.name}`);
  console.log(`  ✓ Existing lead FUB ID: ${duplicate.existingLead.fubId}`);

  console.log('\nStep 5: Verifying FUB record link provided...');

  // Check FUB link is provided
  if (!duplicate.existingLead.fubLink) {
    throw new Error('FUB record link not provided!');
  }

  const expectedLink = `https://app.followupboss.com/2/people/view/${fubPersonId}`;
  if (duplicate.existingLead.fubLink !== expectedLink) {
    throw new Error(`Expected FUB link '${expectedLink}', got '${duplicate.existingLead.fubLink}'`);
  }

  console.log(`  ✓ FUB record link: ${duplicate.existingLead.fubLink}`);
  console.log(`  ✓ Link matches expected format!\n`);

  return true;
}

async function runTests() {
  console.log('========================================');
  console.log('Feature #170: Duplicate detection checks FUB by phone');
  console.log('========================================\n');

  try {
    // Login first
    await login();

    // Reset FUB mock server
    await resetFubMock();

    // Step 1: Create lead in FUB with phone 555-111-2222
    const fubPerson = await createPersonInFub();

    // Verify FUB phone search works
    await verifyFubPhoneSearch();

    // Step 2: Create and upload XLSX with same phone number
    const xlsxPath = createTestXlsx();
    const uploadResult = await uploadXlsx(xlsxPath);

    // Step 3: Run duplicate check
    const duplicateData = await checkDuplicates(uploadResult.importId);

    // Steps 4 & 5: Verify duplicate detected by phone match and FUB link provided
    await verifyDuplicateDetails(duplicateData, fubPerson.id);

    console.log('========================================');
    console.log('All Feature #170 tests PASSED! ✓');
    console.log('========================================\n');

    console.log('Summary:');
    console.log('  1. ✓ Created lead in FUB with phone 555-111-2222');
    console.log('  2. ✓ Uploaded XLSX with same phone number');
    console.log('  3. ✓ Ran duplicate check');
    console.log('  4. ✓ Verified duplicate detected by phone match');
    console.log('  5. ✓ Verified FUB record link provided');

    return true;
  } catch (error) {
    console.error('\n========================================');
    console.error('Test FAILED!');
    console.error('========================================');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

// Run the tests
runTests().then(success => {
  process.exit(success ? 0 : 1);
});
