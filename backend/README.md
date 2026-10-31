# Brightloop backend (step 1: schema + auth)

    cp .env.example .env        # set DATABASE_URL and JWT_SECRET
    npm install
    createdb brightloop
    npm run migrate
    node db/seed-admin.js admin@brightloop.com 'Str0ng!Pass'
    npm run dev

Endpoints: POST /api/auth/signup | login | forgot-password | reset-password
           POST /api/users/staff (admin only), GET /api/users/me
