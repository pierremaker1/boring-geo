import { useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { loadSession } from '../lib/session'

// Récupère la session locale pour la partie de l'URL, sinon renvoie à l'accueil
export function useSession() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const session = useMemo(() => {
    const s = loadSession()
    return s && s.code === code ? s : null
  }, [code])

  useEffect(() => {
    if (!session) navigate('/', { replace: true })
  }, [session, navigate])

  return session
}
