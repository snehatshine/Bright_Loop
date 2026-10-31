require('dotenv').config();
const express = require('express');
const app = express();
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
// Next: products, plans, subscriptions, invoices, discounts, payments, reports

const port = process.env.PORT || 4000;
if (require.main === module) app.listen(port, () => console.log(`API on :${port}`));
module.exports = app;
