// The whole staff API behind one dynamic segment. Vercel counts a function per
// file under api/ and a Hobby deployment takes twelve, so summary, leads, jobs,
// payments, settings, attachment and bank share this one.
export { default } from '../../lib/routes/admin.js'
