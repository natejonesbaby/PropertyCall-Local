/**
 * Follow-up Boss Mock Server
 *
 * A simple mock server that simulates Follow-up Boss API responses for local testing.
 * Run this alongside the main app to test FUB integration without real credentials.
 *
 * Usage: node backend/src/mock/fub-mock-server.js
 * The mock server listens on port 12113
 */

import express from 'express';

const app = express();
const PORT = 12113;

app.use(express.json());

// In-memory storage for mock people/leads
let mockPeople = [];
let nextPersonId = 1000;

// Mock authentication middleware
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;

  // FUB uses Basic Auth with API key as username and empty password
  // Format: "Basic base64(apikey:)"
  if (authHeader && authHeader.startsWith('Basic ')) {
    const base64Credentials = authHeader.substring(6);
    try {
      const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
      const [apiKey] = credentials.split(':');

      // Accept any API key that starts with "KEY" or "MOCK_" or has valid length for testing
      if (apiKey && (apiKey.startsWith('KEY') || apiKey.startsWith('MOCK_') || apiKey.length >= 20)) {
        req.authenticated = true;
        req.apiKey = apiKey;
      }
    } catch (e) {
      // Invalid base64
    }
  }

  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', mock: true, service: 'fub-mock' });
});

// Mock users endpoint (used by health check)
app.get('/v1/users', (req, res) => {
  if (!req.authenticated) {
    return res.status(401).json({
      errorCode: 'unauthorized',
      message: 'Invalid API key'
    });
  }

  res.json({
    users: [
      {
        id: 1,
        name: 'Mock User',
        email: 'mock@example.com',
        role: 'admin',
        created: new Date().toISOString()
      }
    ],
    _metadata: {
      total: 1,
      nextLink: null
    }
  });
});

// Mock people endpoint - GET (list people)
app.get('/v1/people', (req, res) => {
  if (!req.authenticated) {
    return res.status(401).json({
      errorCode: 'unauthorized',
      message: 'Invalid API key'
    });
  }

  const { limit = 20, offset = 0, phone, email } = req.query;

  // Filter by phone if provided
  let filteredPeople = mockPeople;
  if (phone) {
    // Normalize the search phone (remove formatting)
    const normalizedSearchPhone = phone.replace(/[\s\-\.\(\)]/g, '');
    filteredPeople = mockPeople.filter(person => {
      if (!person.phones || person.phones.length === 0) return false;
      return person.phones.some(p => {
        // Normalize each person's phone for comparison
        const normalizedPersonPhone = p.value.replace(/[\s\-\.\(\)]/g, '');
        return normalizedPersonPhone.includes(normalizedSearchPhone) ||
               normalizedSearchPhone.includes(normalizedPersonPhone);
      });
    });
    console.log(`[FUB Mock] Phone search for "${phone}" found ${filteredPeople.length} results`);
  }

  // Filter by email if provided
  if (email) {
    filteredPeople = filteredPeople.filter(person => {
      if (!person.emails || person.emails.length === 0) return false;
      return person.emails.some(e =>
        e.value.toLowerCase().includes(email.toLowerCase())
      );
    });
  }

  const start = parseInt(offset);
  const end = start + parseInt(limit);

  res.json({
    people: filteredPeople.slice(start, end),
    _metadata: {
      total: filteredPeople.length,
      nextLink: end < filteredPeople.length ? `/v1/people?limit=${limit}&offset=${end}` : null
    }
  });
});

// Mock people endpoint - POST (create person)
app.post('/v1/people', (req, res) => {
  if (!req.authenticated) {
    return res.status(401).json({
      errorCode: 'unauthorized',
      message: 'Invalid API key'
    });
  }

  const { firstName, lastName, source, emails, phones, addresses, customFields } = req.body;

  // Validate required fields
  if (!firstName && !lastName && (!phones || phones.length === 0)) {
    return res.status(400).json({
      errorCode: 'validation_error',
      message: 'At least a name or phone number is required'
    });
  }

  // Create mock person
  const newPerson = {
    id: nextPersonId++,
    firstName: firstName || '',
    lastName: lastName || '',
    fullName: `${firstName || ''} ${lastName || ''}`.trim(),
    source: source || 'API',
    emails: emails || [],
    phones: phones || [],
    addresses: addresses || [],
    customFields: customFields || {},
    stage: 'Lead',
    stageId: 1,
    tags: [],
    created: new Date().toISOString(),
    updated: new Date().toISOString()
  };

  mockPeople.push(newPerson);

  console.log(`[FUB Mock] Created person ID ${newPerson.id}: ${newPerson.fullName}`);

  res.status(201).json(newPerson);
});

// Mock people endpoint - GET single person
app.get('/v1/people/:id', (req, res) => {
  if (!req.authenticated) {
    return res.status(401).json({
      errorCode: 'unauthorized',
      message: 'Invalid API key'
    });
  }

  const personId = parseInt(req.params.id);
  const person = mockPeople.find(p => p.id === personId);

  if (!person) {
    return res.status(404).json({
      errorCode: 'not_found',
      message: `Person with ID ${personId} not found`
    });
  }

  res.json(person);
});

// Mock people endpoint - PUT (update person)
app.put('/v1/people/:id', (req, res) => {
  if (!req.authenticated) {
    return res.status(401).json({
      errorCode: 'unauthorized',
      message: 'Invalid API key'
    });
  }

  const personId = parseInt(req.params.id);
  const personIndex = mockPeople.findIndex(p => p.id === personId);

  if (personIndex === -1) {
    return res.status(404).json({
      errorCode: 'not_found',
      message: `Person with ID ${personId} not found`
    });
  }

  // Update person
  const updatedPerson = {
    ...mockPeople[personIndex],
    ...req.body,
    id: personId, // Preserve ID
    updated: new Date().toISOString()
  };

  mockPeople[personIndex] = updatedPerson;

  console.log(`[FUB Mock] Updated person ID ${personId}`);

  res.json(updatedPerson);
});

// Mock notes endpoint - POST (add note to person)
app.post('/v1/notes', (req, res) => {
  if (!req.authenticated) {
    return res.status(401).json({
      errorCode: 'unauthorized',
      message: 'Invalid API key'
    });
  }

  const { personId, subject, body } = req.body;

  if (!personId) {
    return res.status(400).json({
      errorCode: 'validation_error',
      message: 'personId is required'
    });
  }

  const note = {
    id: Date.now(),
    personId,
    subject: subject || 'Note',
    body: body || '',
    created: new Date().toISOString()
  };

  console.log(`[FUB Mock] Created note for person ID ${personId}: ${subject || 'Note'}`);

  res.status(201).json(note);
});

// Mock custom fields endpoint - GET
app.get('/v1/customFields', (req, res) => {
  if (!req.authenticated) {
    return res.status(401).json({
      errorCode: 'unauthorized',
      message: 'Invalid API key'
    });
  }

  res.json({
    customFields: [
      { id: 1, label: 'Property Type', type: 'text' },
      { id: 2, label: 'Bedrooms', type: 'number' },
      { id: 3, label: 'Bathrooms', type: 'number' },
      { id: 4, label: 'Square Feet', type: 'number' },
      { id: 5, label: 'Year Built', type: 'number' },
      { id: 6, label: 'Estimated Value', type: 'currency' },
      { id: 7, label: 'Equity Percent', type: 'percent' },
      { id: 8, label: 'Mortgage Balance', type: 'currency' },
      { id: 9, label: 'Vacant Indicator', type: 'text' },
      { id: 10, label: 'Call Recording URL', type: 'text' },
      { id: 11, label: 'AI Qualification Status', type: 'text' }
    ]
  });
});

// Reset mock data (for testing)
app.post('/v1/_reset', (req, res) => {
  mockPeople = [];
  nextPersonId = 1000;
  console.log('[FUB Mock] Data reset');
  res.json({ success: true, message: 'Mock data reset' });
});

// Get mock data stats (for testing)
app.get('/v1/_stats', (req, res) => {
  res.json({
    peopleCount: mockPeople.length,
    nextPersonId
  });
});

app.listen(PORT, () => {
  console.log(`Follow-up Boss Mock Server running on http://localhost:${PORT}`);
  console.log('Use Basic Auth with API key starting with "KEY" or "MOCK_" for successful auth');
  console.log('Example: Authorization: Basic ' + Buffer.from('KEY_test_12345:').toString('base64'));
});
