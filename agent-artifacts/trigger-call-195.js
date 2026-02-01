// Trigger a call for testing feature 195
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
  console.log('Logged in');

  // Get a lead
  const leadRes = await fetch(`${API_URL}/api/leads?limit=1`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const leadData = await leadRes.json();
  const leadId = leadData.leads[0].id;
  console.log('Using lead ID:', leadId);

  // Trigger call
  const callRes = await fetch(`${API_URL}/api/calls/trigger`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ lead_id: leadId })
  });
  const callData = await callRes.json();
  console.log('Call triggered:', callData.call_id);
  console.log('Initial status:', callData.call?.status);
}

main().catch(console.error);
