// Vercel counts one function per file under api/. The handler lives in
// lib/routes/ so its tests import a plain (req, res) function directly.
export { default } from '../lib/routes/upload.js'
