const db = require('./db');
const { loadDemo } = require('./seed-data');

loadDemo(db);
console.log('Seeded sample data successfully.');