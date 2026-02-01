const Database = require('better-sqlite3');
const db = new Database('backend/data/property_call.db');

// Add extracted qualification data to call 66
const answers = JSON.stringify({
  motivation_to_sell: 'Yes, very interested in selling soon',
  timeline: 'Within 3 months',
  price_expectations: 'Around $425,000'
});

db.prepare(`
  UPDATE calls
  SET
    qualification_status = 'Qualified',
    sentiment = 'Very Motivated',
    disposition = 'Callback Scheduled',
    answers = ?,
    ai_summary = 'Lead is highly motivated to sell their property at 456 Oak Avenue, Miami FL. They expressed interest in selling within 3 months and have price expectations around $425,000. Recommend immediate follow-up.'
  WHERE id = 66
`).run(answers);

const call = db.prepare('SELECT id, status, qualification_status, sentiment, disposition FROM calls WHERE id = 66').get();
console.log('Updated Call 66:', JSON.stringify(call, null, 2));
