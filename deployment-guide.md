# Deployment Guide

## 1. Game Client → Netlify

### Setup

1. **Create a `netlify.toml`** in `game-client/`:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "18"
```

2. **Deploy via Netlify Dashboard:**
   - Connect your GitHub repo
   - Set base directory: `game-client`
   - Add environment variable:
     - `VITE_SOCKET_URL` = `wss://your-game-server-url.railway.app` (set after deploying game server)

3. **Or deploy via CLI:**
```bash
cd game-client
npm run build
npx netlify deploy --prod --dir=dist
```

---

## 2. Game Server → Railway (Recommended)

Railway is the best option for the WebSocket game server because:
- Native WebSocket support
- Easy environment variables
- Auto-deploys from GitHub
- Free tier available

### Setup

1. **Create `Dockerfile`** in `game-server/`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["npm", "start"]
```

2. **Or use Railway's Node.js buildpack** (no Dockerfile needed):
   - Railway auto-detects Node.js projects

3. **Deploy on Railway:**
   - Go to [railway.app](https://railway.app)
   - New Project → Deploy from GitHub repo
   - Set root directory: `game-server`
   - Add environment variables:
     - `PORT` = `3001` (Railway sets this automatically)
     - `STRAPI_URL` = `https://your-strapi-app.strapiapp.com`

4. **Get your server URL:**
   - Railway provides a URL like `your-app.railway.app`
   - Use `wss://your-app.railway.app` for the client's `VITE_SOCKET_URL`

### Alternative: Render.com

Similar setup, also supports WebSockets well.

---

## 3. Game Data Server → Strapi Cloud

### Setup

1. **Go to [cloud.strapi.io](https://cloud.strapi.io)**

2. **Create new project:**
   - Connect GitHub repo
   - Set root directory: `game-data-server`
   - Strapi Cloud handles the database automatically

3. **After deployment:**
   - Get your Strapi URL: `https://your-app.strapiapp.com`
   - Set up API tokens for the game server

4. **Configure API permissions:**
   - Go to Settings → Users & Permissions → Roles → Public
   - Enable `find`, `findOne`, `create`, `update` for your `saves` content type

---

## Deployment Order

1. **Strapi Cloud first** → Get the Strapi URL
2. **Railway second** → Set `STRAPI_URL`, get WebSocket URL
3. **Netlify last** → Set `VITE_SOCKET_URL`

---

## Environment Variables Summary

| Service | Variable | Value |
|---------|----------|-------|
| Netlify (Client) | `VITE_SOCKET_URL` | `wss://your-game-server.railway.app` |
| Railway (Server) | `PORT` | Auto-set by Railway |
| Railway (Server) | `STRAPI_URL` | `https://your-app.strapiapp.com` |

---

## Post-Deployment Checklist

- [ ] Strapi Cloud deployed and API permissions configured
- [ ] Railway game server deployed with correct `STRAPI_URL`
- [ ] Netlify client deployed with correct `VITE_SOCKET_URL`
- [ ] Test WebSocket connection in browser console
- [ ] Verify world saves persist to Strapi
