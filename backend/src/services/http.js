// Express 4 does not catch errors thrown in async handlers. Wrap every handler with this.
const wrap = fn => (req, res) =>
  Promise.resolve(fn(req, res)).catch(e => {
    if (e.code === '23503') return res.status(409).json({ error: 'This record is in use and cannot be removed' });
    if (e.code === '23505') return res.status(409).json({ error: 'A record with these details already exists' });
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  });

// ?page=1&limit=20 -> { limit, offset, page }. Every list endpoint paginates (keeps pages fast).
function paging(req) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

const isNum = v => v !== '' && v !== null && v !== undefined && !isNaN(Number(v));

module.exports = { wrap, paging, isNum };
