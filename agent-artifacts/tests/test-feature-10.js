/**
 * Feature #10 Test: Cannot access another user's leads by manipulating URL
 *
 * Test Steps:
 * 1. Create lead as User A, note lead ID
 * 2. Log out and log in as User B
 * 3. Navigate directly to /leads/{User A's lead ID}
 * 4. Verify 404 or 403 response (not showing User A's data)
 * 5. Verify API endpoint also returns appropriate error
 */

const API_BASE = 'http://localhost:3000/api';

// User credentials
const USER_A = {
  email: 'test@example.com',
  password: 'password123'
};

const USER_B = {
  email: 'userb_test@example.com',
  password: 'password123',
  name: 'User B Test'
};

async function login(email, password) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Login failed');
  }

  const data = await response.json();
  return data.token;
}

async function register(email, password, name) {
  const response = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name })
  });

  if (!response.ok) {
    const data = await response.json();
    // User might already exist, try login instead
    if (data.error && data.error.includes('already exists')) {
      return await login(email, password);
    }
    throw new Error(data.error || 'Registration failed');
  }

  const data = await response.json();
  return data.token;
}

async function createLead(token, firstName, lastName) {
  // Check if lead already exists via import endpoint
  // We'll create a lead via the import preview mechanism
  const response = await fetch(`${API_BASE}/leads`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch leads');
  }

  const data = await response.json();

  // Check if our test lead already exists
  const existingLead = data.leads?.find(l => l.first_name === firstName && l.last_name === lastName);
  if (existingLead) {
    console.log(`  Found existing lead: ${firstName} ${lastName} (ID: ${existingLead.id})`);
    return existingLead;
  }

  // We need to create a lead - let's check the database directly
  // Since there's no direct create API, we'll use an import approach
  // But for testing, we'll need to use the database directly

  console.log('  Need to create lead via database...');
  return null;
}

async function getLeadById(token, leadId) {
  const response = await fetch(`${API_BASE}/leads/${leadId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  return {
    status: response.status,
    data: await response.json()
  };
}

async function getLeads(token) {
  const response = await fetch(`${API_BASE}/leads`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch leads');
  }

  return await response.json();
}

async function runTest() {
  console.log('=== Feature #10 Test: Cannot access another user\'s leads by manipulating URL ===\n');

  try {
    // Step 1: Log in as User A and create/find a lead
    console.log('Step 1: Log in as User A and identify a lead...');
    const tokenA = await login(USER_A.email, USER_A.password);
    console.log('  ✓ User A logged in');

    // Get User A's leads
    const userALeads = await getLeads(tokenA);
    if (userALeads.leads.length === 0) {
      console.log('  ✗ User A has no leads. Please import some leads first.');
      process.exit(1);
    }

    const userALead = userALeads.leads[0];
    console.log(`  ✓ Found User A's lead: "${userALead.first_name} ${userALead.last_name}" (ID: ${userALead.id})`);

    // Step 2: Register/login User B
    console.log('\nStep 2: Create or log in as User B...');
    let tokenB;
    try {
      tokenB = await register(USER_B.email, USER_B.password, USER_B.name);
      console.log('  ✓ User B logged in');
    } catch (err) {
      console.log(`  ✗ Failed to register/login User B: ${err.message}`);
      process.exit(1);
    }

    // Step 3: User B tries to access User A's lead by ID
    console.log('\nStep 3: User B attempts to access User A\'s lead by ID...');
    const result = await getLeadById(tokenB, userALead.id);
    console.log(`  API Response Status: ${result.status}`);
    console.log(`  API Response Body: ${JSON.stringify(result.data)}`);

    // Step 4: Verify 404 or 403 response
    console.log('\nStep 4: Verify 404 or 403 response...');
    if (result.status === 404 || result.status === 403) {
      console.log(`  ✓ PASS: Received ${result.status} status (data isolation enforced)`);
    } else {
      console.log(`  ✗ FAIL: Expected 404 or 403, but received ${result.status}`);
      if (result.data.lead) {
        console.log(`  ✗ SECURITY ISSUE: User B can see User A's lead data!`);
        console.log(`     Lead: ${result.data.lead.first_name} ${result.data.lead.last_name}`);
      }
      process.exit(1);
    }

    // Step 5: Verify no data is returned
    console.log('\nStep 5: Verify no data is returned in response...');
    if (result.data.lead === undefined) {
      console.log('  ✓ PASS: No lead data in response');
    } else {
      console.log('  ✗ FAIL: Lead data was returned');
      process.exit(1);
    }

    // Additional test: User B's leads should be empty (new user)
    console.log('\nAdditional: Verify User B has their own isolated leads...');
    const userBLeads = await getLeads(tokenB);
    console.log(`  User B has ${userBLeads.leads.length} leads (expected: 0 for new user)`);

    // Verify User B cannot see User A's leads in their list
    const userBHasUserALead = userBLeads.leads.some(l => l.id === userALead.id);
    if (!userBHasUserALead) {
      console.log('  ✓ PASS: User A\'s lead is not in User B\'s lead list');
    } else {
      console.log('  ✗ FAIL: User A\'s lead appears in User B\'s lead list!');
      process.exit(1);
    }

    // Test PUT endpoint
    console.log('\nAdditional: Test PUT endpoint protection...');
    const putResult = await fetch(`${API_BASE}/leads/${userALead.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenB}`
      },
      body: JSON.stringify({ first_name: 'HACKED' })
    });
    console.log(`  PUT /api/leads/${userALead.id} - Status: ${putResult.status}`);
    if (putResult.status === 404 || putResult.status === 403) {
      console.log('  ✓ PASS: User B cannot update User A\'s lead');
    } else {
      console.log('  ✗ FAIL: User B was able to update User A\'s lead!');
      process.exit(1);
    }

    // Test DELETE endpoint
    console.log('\nAdditional: Test DELETE endpoint protection...');
    const deleteResult = await fetch(`${API_BASE}/leads/${userALead.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${tokenB}`
      }
    });
    console.log(`  DELETE /api/leads/${userALead.id} - Status: ${deleteResult.status}`);
    if (deleteResult.status === 404 || deleteResult.status === 403) {
      console.log('  ✓ PASS: User B cannot delete User A\'s lead');
    } else {
      console.log('  ✗ FAIL: User B was able to delete User A\'s lead!');
      process.exit(1);
    }

    // Verify User A's lead is still intact
    console.log('\nVerify User A\'s lead is still intact...');
    const verifyResult = await getLeadById(tokenA, userALead.id);
    if (verifyResult.status === 200 && verifyResult.data.lead) {
      console.log(`  ✓ PASS: User A can still access their own lead`);
      console.log(`     Lead name: ${verifyResult.data.lead.first_name} ${verifyResult.data.lead.last_name}`);
    } else {
      console.log('  ✗ FAIL: User A\'s lead was affected');
      process.exit(1);
    }

    console.log('\n=============================================================');
    console.log('✅ FEATURE #10 TEST PASSED: Cannot access another user\'s leads');
    console.log('   - Data isolation is properly enforced');
    console.log('   - 404 response for unauthorized access');
    console.log('   - PUT/DELETE also protected');
    console.log('=============================================================');

  } catch (error) {
    console.error('\n✗ Test failed with error:', error.message);
    process.exit(1);
  }
}

runTest();
