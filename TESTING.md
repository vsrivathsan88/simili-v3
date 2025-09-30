# Testing Guide for Simili v2

## What Was Fixed

### 1. ✅ Layout Fixed - No More Scrolling
The lesson layout now properly fits within the viewport:
- Container uses `height: 100vh` and `overflow: hidden`
- Flexbox layout with proper `min-height: 0` constraints
- Scene and canvas containers flex to fill available space
- No scrolling required - everything fits on screen

### 2. ✅ Token Connection Improved
Enhanced the ephemeral token connection with better error handling:
- Improved server-side logging and fallback mechanism
- Better client-side error reporting
- Automatic fallback to API key if ephemeral tokens fail
- Clear console logging for debugging

---

## Prerequisites

### 1. Environment Setup
Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

**How to get an API key:**
1. Go to https://aistudio.google.com/apikey
2. Create a new API key
3. Copy it to your `.env` file

### 2. Install Dependencies

```bash
npm install
```

---

## Running the App

### Option 1: Run Everything (Recommended)
```bash
npm run dev:full
```

This starts both:
- **Vite dev server** (http://localhost:3000) - frontend
- **Token server** (http://localhost:3001) - backend for tokens

### Option 2: Run Separately

**Terminal 1 - Token Server:**
```bash
npm run server
```

**Terminal 2 - Frontend:**
```bash
npm run dev
```

---

## Testing Checklist

### ✅ Layout Testing
1. **Open the app** at http://localhost:3000
2. **Click "Lesson" mode** (if not already in lesson mode)
3. **Check viewport fit:**
   - [ ] No vertical scrolling on the page
   - [ ] Header is visible at top
   - [ ] Scene image and canvas are side-by-side
   - [ ] Both containers fill the available space
   - [ ] Transcript toggle button is visible in top-right

### ✅ Connection Testing
1. **Open browser console** (F12 or Cmd+Opt+I)
2. **Look for these logs:**
   ```
   [CLIENT] Fetching token from server...
   [CLIENT] Token response: { hasToken: true, ... }
   [CLIENT] GenAI Live client initialized successfully
   ```
3. **Check the server terminal** for:
   ```
   [INFO] Token request received, API key present: true
   [INFO] Creating ephemeral token...
   [SUCCESS] Ephemeral token created successfully
   ```
   OR (if fallback):
   ```
   [WARN] Ephemeral tokens API not available
   [INFO] Using direct API key as fallback
   ```

### ✅ Scene Switching Testing
1. **Enable lesson-tutor tools** in sidebar:
   - Click settings icon (⚙️)
   - Under "Template", select "lesson-tutor"
   - Verify "switch_scene" tool is enabled
2. **Load system prompt:**
   - In settings, paste content from `system-prompt.md`
   - Click save
3. **Connect to Live API:**
   - Click the phone icon to connect
   - Wait for "Connected" status
4. **Test scene switching:**
   - Manually change scene via dropdown
   - Observe scene changes in UI
   - Check transcript for scene change logs
5. **Test AI-driven switching:**
   - Start conversation with Pi
   - Ask Pi to show a different scene
   - Observe if Pi calls `switch_scene` tool
   - Verify image actually changes

---

## Common Issues & Solutions

### Issue: "Server misconfigured: missing GEMINI_API_KEY"
**Solution:** 
- Check your `.env` file exists in project root
- Verify `GEMINI_API_KEY=your_key` is set
- Restart the server (`npm run server`)

### Issue: "Token fetch failed (500)"
**Solution:**
- Check server logs for detailed error
- Verify API key is valid at https://aistudio.google.com/apikey
- The system will fallback to direct API key automatically

### Issue: "Using API key fallback" warning
**This is OK for development!** 
- Ephemeral tokens may not be available in current @google/genai version
- The app will work fine with the fallback
- To get ephemeral tokens, update `@google/genai` to latest version:
  ```bash
  npm install @google/genai@latest
  ```

### Issue: Layout still has scrolling
**Solution:**
- Hard refresh browser (Cmd+Shift+R / Ctrl+Shift+R)
- Clear browser cache
- Check browser console for CSS errors

### Issue: WebSocket connection fails
**Solution:**
- Ensure server is running on port 3001
- Check browser console for connection errors
- Verify API key has Live API access enabled

---

## Development Tips

### Viewing Logs
- **Browser Console** (F12): Client-side logs prefixed with `[CLIENT]`
- **Server Terminal**: Server-side logs prefixed with `[INFO]`, `[WARN]`, `[ERROR]`

### Testing Scene Metadata
All scene metadata is in `/public/scenes/scenes.json`:
- Milestone mappings (M0-M4)
- Misconception targets
- Focusing prompts
- Pedagogical notes

### Testing Dynamic System Prompt
The system prompt automatically injects current scene context:
- Scene title and description
- Representation type (area, number line, set)
- Focusing prompts for that specific scene
- Milestone and misconception info

---

## Next Steps After Testing

Once everything works:
1. **Test with real interactions** - Have conversations with Pi
2. **Validate scene progression** - Ensure Pi switches scenes appropriately
3. **Check focusing vs funneling** - Verify Pi uses open-ended questions
4. **Test misconception handling** - See if Pi addresses student errors well

---

## Build for Production

When ready to deploy:

```bash
npm run build
```

This creates optimized files in `/dist`.

**Important for production:**
- Use real ephemeral tokens (update @google/genai if needed)
- Don't expose API keys to browser
- Set up proper CORS restrictions
- Use environment-specific configs

---

## Need Help?

Check these files:
- `system-prompt.md` - Full AI tutor instructions
- `dev-plan.md` - Development roadmap
- `requirements.md` - Original requirements
