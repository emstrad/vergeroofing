import { json, actionFrom } from '../http.js'
import { requireAuth } from '../session.js'
import summary from './admin/summary.js'
import leads from './admin/leads.js'
import jobs from './admin/jobs.js'
import payments from './admin/payments.js'
import settings from './admin/settings.js'
import attachment from './admin/attachment.js'
import bank from './admin/bank.js'

// One serverless function for the whole staff API. Vercel counts a function per
// file under api/, and a Hobby deployment takes twelve; going over fails at the
// deploy step rather than the build, where the log looks clean and the refusal
// only shows on the deployment page.
const ACTIONS = { summary, leads, jobs, payments, settings, attachment, bank }

export default async function adminHandler(req, res) {
  if (!requireAuth(req, res)) return
  const handler = ACTIONS[actionFrom(req)]
  if (!handler) return json(res, 404, { error: 'unknown_action' })
  return handler(req, res)
}
