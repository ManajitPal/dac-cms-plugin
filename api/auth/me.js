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

export default function handler(req, res) {
  const cookies = parseCookies(req)
  res.json({ authenticated: !!cookies.wf_token })
}
