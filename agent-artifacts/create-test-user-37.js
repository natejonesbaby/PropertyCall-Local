const API_BASE = 'http://localhost:3000/api';
const TIMESTAMP = Date.now();
const EMAIL = `test_ui_empty_37_${TIMESTAMP}@example.com`;

fetch(`${API_BASE}/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: EMAIL,
    password: 'TestPassword123!',
    name: 'UI Empty Test User'
  })
})
.then(res => res.json())
.then(data => {
  console.log(JSON.stringify(data, null, 2));
  console.log('');
  console.log(`Created user: ${EMAIL}`);
})
.catch(err => console.error('Error:', err));
