# 🚀 Deployment Guide — Inventory POS

This guide covers **three deployment paths**:
1. [Docker (local/self-hosted)](#option-1-docker-compose) — full stack in one command
2. [Vercel + Render (cloud)](#option-2-vercel--render) — free tier, recommended for production
3. [Quick checklist](#post-deployment-checklist)

---

## Option 1: Docker Compose

> Spin up the entire stack locally with one command. Great for testing production builds.

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running

### Steps

```bash
# 1. From the project root:
cd /path/to/Business-Project

# 2. Set your secrets (or use the defaults for testing)
export JWT_ACCESS_SECRET="your-production-access-secret-here"
export JWT_REFRESH_SECRET="your-production-refresh-secret-here"
export CLOUDINARY_CLOUD_NAME="dyw94xwuf"
export CLOUDINARY_API_KEY="586466667247482"
export CLOUDINARY_API_SECRET="JgZlEeacEdMyPLkIxpvFHzdchMI"

# 3. Build and start everything
docker compose up --build

# 4. Open in browser
#    Frontend: http://localhost:3000
#    Backend:  http://localhost:5000/api/health
```

### Useful Commands
```bash
docker compose down          # Stop all containers
docker compose down -v       # Stop + delete database data
docker compose logs backend  # View backend logs
docker compose exec backend node src/seeds/seedAdmin.js  # Seed admin user
```

---

## Option 2: Vercel + Render

> **Frontend** on Vercel (free, global CDN) + **Backend** on Render (free Node.js hosting).

### Step 1: Push to GitHub

If you haven't already:

```bash
cd /path/to/Business-Project

# Make sure .env is gitignored (it already is in backend/.gitignore)
# ⚠️ CRITICAL: Never push backend/.env to GitHub

git init
git add .
git commit -m "Initial commit — Inventory POS full-stack"

# Create a repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/Business-Project.git
git branch -M main
git push -u origin main
```

---

### Step 2: Deploy Backend on Render

1. **Go to** [render.com](https://render.com) → Sign up / Log in

2. **New → Web Service** → Connect your GitHub repo

3. **Configure the service:**

   | Setting | Value |
   |---------|-------|
   | **Name** | `inventory-pos-api` |
   | **Root Directory** | `backend` |
   | **Runtime** | Node |
   | **Build Command** | `npm install` |
   | **Start Command** | `node src/server.js` |
   | **Instance Type** | Free |

4. **Add Environment Variables** (Settings → Environment):

   | Variable | Value |
   |----------|-------|
   | `NODE_ENV` | `production` |
   | `PORT` | `5000` |
   | `MONGO_URI` | `mongodb+srv://...` (your Atlas connection string) |
   | `JWT_ACCESS_SECRET` | (generate: `openssl rand -hex 48`) |
   | `JWT_REFRESH_SECRET` | (generate: `openssl rand -hex 48`) |
   | `JWT_ACCESS_EXPIRES_IN` | `15m` |
   | `JWT_REFRESH_EXPIRES_IN` | `7d` |
   | `LOGIN_RATE_LIMIT_WINDOW_MS` | `900000` |
   | `LOGIN_RATE_LIMIT_MAX` | `5` |
   | `CORS_ORIGIN` | (set after Vercel deploy — e.g. `https://your-app.vercel.app`) |
   | `CLOUDINARY_CLOUD_NAME` | `dyw94xwuf` |
   | `CLOUDINARY_API_KEY` | `586466667247482` |
   | `CLOUDINARY_API_SECRET` | `JgZlEeacEdMyPLkIxpvFHzdchMI` |
   | `REDIS_URL` | (see Redis setup below) |
   | `STORE_NAME` | `Inventory POS` |

5. **Click "Create Web Service"** → Render will build and deploy

6. **Note your backend URL**: `https://inventory-pos-api.onrender.com`

#### Redis on Render

Render offers a free Redis instance:

1. **Dashboard → New → Redis**
2. Name: `pos-redis`, Instance: Free
3. Copy the **Internal URL** (looks like `redis://red-xxxxx:6379`)
4. Paste into your Web Service's `REDIS_URL` env var

> ⚠️ **Free tier limitation**: Render free services sleep after 15 minutes of inactivity. The first request after sleep takes ~30 seconds. Upgrade to $7/month to eliminate this.

#### Seed the Admin User

After the backend deploys:
1. Go to your Render Web Service → **Shell** tab
2. Run:
   ```bash
   node src/seeds/seedAdmin.js
   ```
3. Note the admin credentials printed in the output

---

### Step 3: Deploy Frontend on Vercel

1. **Go to** [vercel.com](https://vercel.com) → Sign up / Log in

2. **Add New Project** → Import your GitHub repo

3. **Configure:**

   | Setting | Value |
   |---------|-------|
   | **Framework** | Vite |
   | **Root Directory** | `frontend` |
   | **Build Command** | `npm run build` |
   | **Output Directory** | `dist` |

4. **Add Environment Variable:**

   | Variable | Value |
   |----------|-------|
   | `VITE_API_URL` | `https://inventory-pos-api.onrender.com/api` |

   > This tells the frontend where the backend lives in production.

5. **Click "Deploy"**

6. **Note your frontend URL**: `https://your-app.vercel.app`

---

### Step 4: Connect the Dots

After both services are live, you need to update one thing:

1. **Go to Render** → your Web Service → Environment
2. **Update `CORS_ORIGIN`** to your Vercel URL:
   ```
   https://your-app.vercel.app
   ```
3. Render will auto-redeploy with the new CORS setting

---

## Post-Deployment Checklist

After deploying, verify everything works:

```bash
# 1. Health check (replace with your Render URL)
curl https://inventory-pos-api.onrender.com/api/health
# Expected: {"success":true,"message":"Server is healthy",...}

# 2. Open the frontend in a browser
open https://your-app.vercel.app

# 3. Login with the seeded admin credentials

# 4. Test the full flow:
#    ✅ Login
#    ✅ View dashboard
#    ✅ Create a product
#    ✅ Go to POS → add to cart → checkout
#    ✅ View sale in Sales page
```

### Troubleshooting

| Problem | Solution |
|---------|----------|
| **CORS error in console** | Update `CORS_ORIGIN` in Render env vars to match your Vercel domain exactly |
| **401 on all API calls** | Check `VITE_API_URL` in Vercel — must include `/api` at the end |
| **Backend 503 / slow first load** | Render free tier is sleeping — wait 30s or upgrade |
| **"Invalid environment variables"** | Missing env vars on Render — check all required vars are set |
| **MongoDB connection fails** | Check `MONGO_URI` — make sure Render's IP is allowlisted in Atlas Network Access (or use `0.0.0.0/0`) |
| **Redis errors** | Redis is optional — the backend works without it (receipts/audit queue disabled) |

---

## Architecture in Production

```
┌─────────────────────┐         ┌──────────────────────────┐
│   Vercel (CDN)      │         │   Render (Web Service)   │
│                     │  HTTPS  │                          │
│   React SPA         │────────▶│   Express API            │
│   (Static files)    │         │   Node.js 22             │
│                     │         │                          │
│   VITE_API_URL ─────│─────────│──▶ /api/*                │
└─────────────────────┘         │                          │
                                │   ┌──────────┐           │
                                │   │ MongoDB  │ (Atlas)   │
                                │   │ Atlas    │           │
                                │   └──────────┘           │
                                │   ┌──────────┐           │
                                │   │ Redis    │ (Render)  │
                                │   └──────────┘           │
                                └──────────────────────────┘
```

---

## Generate Secure Secrets

```bash
# JWT secrets (run these locally, paste into Render env vars)
openssl rand -hex 48   # → JWT_ACCESS_SECRET
openssl rand -hex 48   # → JWT_REFRESH_SECRET
```

---

## Cost Summary

| Service | Tier | Monthly Cost |
|---------|------|-------------|
| Vercel | Hobby | **Free** |
| Render Web Service | Free | **Free** (sleeps after 15min inactivity) |
| Render Redis | Free | **Free** (25MB limit) |
| MongoDB Atlas | M0 | **Free** (512MB) |
| Cloudinary | Free | **Free** (25GB bandwidth) |
| **Total** | | **$0/month** |

> To eliminate cold starts: Render Starter plan is $7/month.
