function parseCookies(req) {
  const list = {}
  const header = req.headers.cookie
  if (!header) return list
  header.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=')
    list[name.trim()] = rest.join('=')
  })
  return list
}

export default async function handler(req, res) {
  const { code, state, error } = req.query

  if (error) return res.redirect(`/?error=${encodeURIComponent(error)}`)

  const cookies = parseCookies(req)
  if (!state || state !== cookies.oauth_state) {
    return res.status(400).send('Invalid OAuth state — possible CSRF attempt.')
  }

  const tokenRes = await fetch('https://api.webflow.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.WEBFLOW_CLIENT_ID,
      client_secret: process.env.WEBFLOW_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: process.env.WEBFLOW_REDIRECT_URI,
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    return res.status(500).send(`Token exchange failed: ${err}`)
  }

  const { access_token } = await tokenRes.json()
  const secure = process.env.NODE_ENV === 'production' ? 'Secure; ' : ''

  res.setHeader('Set-Cookie', [
    `wf_token=${access_token}; HttpOnly; ${secure}SameSite=Lax; Path=/; Max-Age=31536000`,
    `oauth_state=; HttpOnly; ${secure}SameSite=Lax; Path=/; Max-Age=0`,
  ])
  res.redirect('/')
}
