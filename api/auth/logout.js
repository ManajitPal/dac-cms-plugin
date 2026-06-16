export default function handler(req, res) {
  const secure = process.env.NODE_ENV === 'production' ? 'Secure; ' : ''
  res.setHeader('Set-Cookie', `wf_token=; HttpOnly; ${secure}SameSite=Lax; Path=/; Max-Age=0`)
  res.redirect('/')
}
