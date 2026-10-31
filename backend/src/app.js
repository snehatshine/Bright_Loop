require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const app = express();
app.use(require('cors')());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Every file in src/routes is mounted automatically: products.js -> /api/products
const dir = path.join(__dirname, 'routes');
for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
  app.use('/api/' + file.replace('.js', ''), require(path.join(dir, file)));
}

const port = process.env.PORT || 4000;
if (require.main === module) {
  require('./services/scheduler').start();
  app.listen(port, () => console.log(`API on :${port}`));
}
module.exports = app;