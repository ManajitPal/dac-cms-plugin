import { randomBytes } from 'crypto'

export default function handler(req, res) {
  const state = randomBytes(16).toString('hex')
  const params = new URLSearchParams({
    client_id: process.env.WEBFLOW_CLIENT_ID,
    response_type: 'code',
    scope: 'cms:write assets:write',
    state,
    redirect_uri: process.env.WEBFLOW_REDIRECT_URI,
  })
  const secure = process.env.NODE_ENV === 'production' ? 'Secure; ' : ''
  res.setHeader('Set-Cookie', `oauth_state=${state}; HttpOnly; ${secure}SameSite=Lax; Path=/; Max-Age=600`)
  res.redirect(`https://webflow.com/oauth/authorize?${params}`)
}
