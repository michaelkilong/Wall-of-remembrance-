# Wall of Remembrance

A living, infinite digital memorial wall. Visitors leave handwritten notes that appear in real-time for everyone else. No sign-in required.

## Live Demo

Deployed on **Vercel**: `https://your-project.vercel.app`

## Features

- **Infinite pan & zoom** — Drag to move around the wall, scroll to zoom in/out
- **Place anywhere** — Click "Add Note", then click exactly where you want it on the wall
- **Real-time sync** — Notes appear instantly for all visitors via Firebase Firestore
- **Permanent memory** — Once placed, notes stay forever. No deletion, no editing.
- **Ambient atmosphere** — Floating golden dust particles, dim lighting, warm tones
- **Fully responsive** — Works on desktop (mouse) and mobile (touch + pinch-to-zoom)
- **Zero sign-in friction** — Just name, message, and place

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vanilla HTML5 / CSS3 / ES Modules |
| Backend / Database | Firebase Firestore (free tier) |
| Hosting | Vercel (static) |
| Fonts | Google Fonts (Inter + Playfair Display) |

## Project Structure

```
.
├── index.html          # Single-file application (all CSS + JS inlined)
├── config.js           # Firebase credentials (gitignored, see setup)
├── config.example.js   # Template for config.js
├── README.md           # This file
├── LICENSE             # MIT License
└── .gitignore          # Standard ignore rules
```

> **Note:** The entire app is intentionally contained in a single `index.html` file so it can be deployed to any static host with zero configuration. Firebase config lives in a separate `config.js` so your API keys are never committed to GitHub.

## Setup

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project (e.g. `wall-of-remembrance`)
3. Navigate to **Build → Firestore Database → Create Database**
4. Choose **Start in production mode**

### 2. Register a Web App

1. Project settings → General → Your apps → **Add app** → Web
2. Copy the `firebaseConfig` object
3. Create `config.js` from the template:

```bash
cp config.example.js config.js
```

4. Open `config.js` and paste your real Firebase credentials:

```javascript
export const firebaseConfig = {
  apiKey: "your-real-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

### 3. Set Firestore Security Rules

In Firebase Console, go to **Firestore Database → Rules** and paste:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /notes/{noteId} {
      allow read: if true;
      allow create: if request.resource.data.name is string
        && request.resource.data.name.size() > 0
        && request.resource.data.name.size() < 50
        && request.resource.data.message is string
        && request.resource.data.message.size() > 0
        && request.resource.data.message.size() < 500
        && request.resource.data.x is number
        && request.resource.data.y is number;
      allow update, delete: if false;
    }
  }
}
```

These rules allow anyone to read and create notes, but never modify or delete them — ensuring the wall remains a permanent, trustworthy memorial.

### 4. Deploy to Vercel

#### Option A: GitHub + Vercel Dashboard (Recommended)

1. Create a new GitHub repository and push this code:

```bash
git init
git add index.html config.example.js README.md LICENSE .gitignore
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/wall-of-remembrance.git
git push -u origin main
```

> **Important:** Do NOT commit `config.js`. It is already in `.gitignore`.

2. Go to [vercel.com](https://vercel.com), sign in with GitHub
3. Click **Add New Project** → Import your GitHub repo
4. Framework preset: **Other** (static)
5. Click **Deploy**

6. After first deploy, go to Vercel project settings → **Environment Variables** is not needed for this static app, but you must upload your `config.js` manually or use Vercel CLI to add it to the deployment.

   Alternatively, for local/Vercel CLI deploys:

```bash
npm i -g vercel
vercel --prod
```

### 5. (Optional) Custom Domain

In Vercel project settings → Domains → Add your custom domain.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `+` / `=` | Zoom in |
| `-` | Zoom out |
| `Esc` | Close modal / Cancel placement |
| `Mouse drag` | Pan around the wall |
| `Scroll wheel` | Zoom in/out |
| `Click + Add Note` | Enter placement mode |

## Mobile Gestures

| Gesture | Action |
|---------|--------|
| Single finger drag | Pan |
| Two finger pinch | Zoom in/out |
| Tap note | Open detail view |
| Tap + Add Note | Enter placement mode, tap wall to place |

## Customization

### Change the wall size
Edit the `WALL_SIZE` constant in `index.html` (default: `4000` px).

### Change note colors
Edit the `NOTE_CLASSES` array in `index.html` and add matching CSS classes.

### Remove particles
Comment out `initParticles()` and `animateParticles()` at the bottom of the script.

## License

MIT License — feel free to fork, modify, and deploy your own version. See [LICENSE](./LICENSE) for details.

## Credits

- Fonts: [Google Fonts](https://fonts.google.com) (Inter + Playfair Display)
- Backend: [Firebase](https://firebase.google.com) (Firestore)
- Hosting: [Vercel](https://vercel.com)
