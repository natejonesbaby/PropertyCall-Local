const sqlite3 = require('better-sqlite3');
const db = new sqlite3('backend/data/property_call.db');

const prompts = db.prepare(`
  SELECT type, content, created_at, updated_at
  FROM prompts
  WHERE user_id = 1
  ORDER BY type
`).all();

console.log('Prompts in database:');
console.log(JSON.stringify(prompts, null, 2));

const systemPrompt = prompts.find(p => p.type === 'system');
if (systemPrompt && systemPrompt.content.includes('UNIQUE_PROMPT_TEST_123')) {
  console.log('\n✅ VERIFIED: UNIQUE_PROMPT_TEST_123 found in database!');
} else {
  console.log('\n❌ FAILED: UNIQUE_PROMPT_TEST_123 NOT found in database');
}

db.close();
