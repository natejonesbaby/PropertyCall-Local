/**
 * Create test user for Feature #45 testing
 */
const http = async (method, url, data = null) => {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (data) options.body = JSON.stringify(data);
  const response = await fetch(url, options);
  return await response.json();
};

async function createUser() {
  const timestamp = Date.now();
  const email = `test_feature_45_${timestamp}@example.com`;

  console.log('Creating test user:', email);

  const result = await http('POST', 'http://localhost:3000/api/auth/register', {
    email,
    password: 'password'
  });

  console.log('Result:', result);

  if (result.token || result.user) {
    console.log('\n✅ User created successfully!');
    console.log('Email:', email);
    console.log('Password: password');

    if (result.token) {
      console.log('Token:', result.token);
    }
  } else {
    console.error('❌ Failed to create user:', result);
  }
}

createUser().catch(console.error);
