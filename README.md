# StreetMeet PWA

**Put The City On** — A progressive web app for photography communities across the United States.

## Live Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@streetmeet.com | admin123 |
| Host | kevin@streetmeet.com | host123 |
| User | user@streetmeet.com | user123 |

---

## Project Structure

```
streetmeet-pwa/
├── index.html          ← Main app (all pages)
├── manifest.json       ← PWA manifest
├── sw.js               ← Service worker (offline support)
├── css/
│   └── main.css        ← All styles, design tokens, components
├── js/
│   ├── app.js          ← Main app logic, routing, events, RSVP
│   ├── auth.js         ← User auth, login, register, profiles
│   └── chat.js         ← AIM-style chat boards
├── images/             ← Upload your photos here
│   ├── icon-192.png    ← PWA icon (create these)
│   └── icon-512.png    ← PWA icon (create these)
└── README.md
```

---

## Deploy to GitHub Pages

1. Create a new GitHub repository (e.g. `streetmeet-pwa`)
2. Upload all files keeping the folder structure above
3. Go to **Settings → Pages → Source → main branch → / (root)**
4. Your site goes live at `https://yourusername.github.io/streetmeet-pwa`

### Connect Your Custom Domain

1. In repo Settings → Pages → Custom domain, enter your domain (e.g. `streetmeet.com`)
2. In GoDaddy (or your DNS provider), add these 4 A records:
   - `185.199.108.153`
   - `185.199.109.153`
   - `185.199.110.153`
   - `185.199.111.153`
3. Add a CNAME record: `www` → `yourusername.github.io`
4. Wait up to 24 hours, then enable **Enforce HTTPS** in GitHub Pages settings

---

## Adding Photos

Upload photos directly to GitHub in the `/images` folder. Then reference them in the app:

```
images/event-photo.jpg
images/smdc-highlight-1.jpg
```

For videos, upload to YouTube and use the embed URL shown in the app.

---

## Customizing Communities

Edit `SM.communityData` in `js/app.js` to update community names, hosts, descriptions, and Instagram handles.

To add a new community:
1. Add an entry to `SM.communityData` in `js/app.js`
2. Add a new community page div in `index.html` following the same pattern as SMDC/SMWA/SMMD
3. Add a dropdown item in the nav and mobile nav

---

## Connecting a Real Backend

Currently the app uses `localStorage` for data (great for demos, not production). To connect a real database:

- **Firebase** (recommended for this type of app — free tier is generous)
  - Replace `localStorage` calls in `js/auth.js` with Firebase Auth
  - Replace event/chat data in `js/app.js` and `js/chat.js` with Firestore
- **Supabase** (open-source Firebase alternative)
- **Any REST API** — swap the data functions in `js/auth.js`

The functions to replace are clearly marked at the top of each JS file.

---

## Creating PWA Icons

You need `images/icon-192.png` and `images/icon-512.png` for the PWA install prompt.

Free tool: [realfavicongenerator.net](https://realfavicongenerator.net) — upload your logo and it generates all sizes.

---

## Style Guide

| Token | Value |
|-------|-------|
| Background | `#E6F5F4` |
| Black | `#000000` |
| Button Red | `#c00000` |
| Header Font | Bebas Neue |
| Body Font | Helvetica Neue |
| H1 | 4rem |
| H2 | 2.8rem |
| H3 | 2.2rem |
| H4 | 1.2rem |
| P1 | 1.4rem |
| P2 | 1rem |
| P3 | 0.9rem |

---

StreetMeet Put The City On ® | StreetMeet, LLC
