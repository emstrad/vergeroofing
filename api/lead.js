// Vercel counts one function per file under api/. The handler lives in
// lib/routes/ so its tests import a plain (req, res) function directly, and so
// related routes can be grouped behind one file if the twelve function ceiling
// on Hobby ever bites.
export { default } from '../lib/routes/lead.js'
