# SVIT ERP Proxy Gateway Deployment Guide (Render.com)

This standalone Node.js proxy bridges your Next.js frontend (deployed on Vercel) to the college Accredia ERP portal running on **port 8084**.

---

### Step 1: Push `proxy-server` to GitHub

You can either:
- Create a new small GitHub repo named `svit-erp-proxy` containing the files inside `proxy-server/`:
  - `index.js`
  - `package.json`
- **Or** push your existing repository to GitHub (Render allows you to select a subfolder / root directory).

---

### Step 2: Deploy on Render (Free)

1. Go to [dashboard.render.com](https://dashboard.render.com) and sign in.
2. Click **New +** -> **Web Service**.
3. Select your GitHub repository.
4. Fill in the fields:
   - **Name**: `svit-erp-proxy`
   - **Runtime**: `Node`
   - **Root Directory**: `proxy-server` (if deployed from monorepo, otherwise leave blank)
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
   - **Instance Type**: `Free`
5. Click **Create Web Service**.

Once deployed in ~1 minute, Render will give you a public URL like:
`https://svit-erp-proxy.onrender.com`

---

### Step 3: Link Proxy to Vercel

1. Go to your Vercel Dashboard -> your project (`svit-erp2`).
2. Go to **Settings** -> **Environment Variables**.
3. Edit or add `ERP_GATEWAY_URL`:
   - **Key**: `ERP_GATEWAY_URL`
   - **Value**: `https://svit-erp-proxy.onrender.com` (your Render URL, without trailing slash)
4. Trigger a **Redeploy** on Vercel.

---

### Why this works:
- Render does not block outbound connections to custom port `8084`.
- Vercel connects over standard HTTPS (port 443) to your Render proxy.
- Set-Cookie, login sessions, attendance logs, and marks flow through with connection keep-alive and without Cloudflare 521 errors.
