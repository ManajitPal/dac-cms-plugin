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
  const cookies = parseCookies(req)
  const token = cookies.wf_token
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  const { path: pathParam, ...queryParams } = req.query
  const pathStr = Array.isArray(pathParam) ? pathParam.join('/') : pathParam
  const qs = new URLSearchParams(queryParams).toString()
  const url = `https://api.webflow.com/${pathStr}${qs ? `?${qs}` : ''}`

  const isFormData = req.headers['content-type']?.includes('multipart/form-data')

  const wfRes = await fetch(url, {
    method: req.method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(!isFormData && { 'Content-Type': 'application/json' }),
    },
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
  })

  const contentType = wfRes.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    res.status(wfRes.status).json(await wfRes.json())
  } else {
    res.status(wfRes.status).send(await wfRes.text())
  }
}
