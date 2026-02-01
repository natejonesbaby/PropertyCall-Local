const db = require('./backend/src/database/index.js').db;
const feature = db.prepare('SELECT * FROM features WHERE id = 226').get();
console.log(JSON.stringify(feature, null, 2));
