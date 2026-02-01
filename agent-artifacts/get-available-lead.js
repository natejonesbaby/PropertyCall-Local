// Get an available lead for testing
const API_URL = 'http://localhost:3000';

async function main() {
  // Login
  const loginRes = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
  });
  const loginData = await loginRes.json();
  const token = loginData.token;

  // Get first available lead
  const searchRes = await fetch(`${API_URL}/api/leads?limit=5`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const searchData = await searchRes.json();
  console.log('Total leads:', searchData.pagination?.total);

  if (searchData.leads && searchData.leads.length > 0) {
    const lead = searchData.leads[0];
    console.log('First lead:');
    console.log('  ID:', lead.id);
    console.log('  Name:', lead.first_name, lead.last_name);
    console.log('  Phones:', lead.phones);
    console.log('  Status:', lead.status);
  } else {
    console.log('No leads available');
  }
}

main().catch(console.error);
