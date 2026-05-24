export default function handler(req, res) {
  res.status(200).json({
    hasUrl: Boolean(process.env.SUPABASE_URL),
    hasKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  });
}
