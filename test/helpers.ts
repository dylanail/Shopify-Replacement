import { Db, setDb } from '../src/lib/db.ts'
import { register } from '../src/control/auth.ts'
import '../src/agent/tools/index.ts'

export function fresh() {
  const db = new Db(':memory:')
  setDb(db)
  const user = register(db, { email: `t${Math.random().toString(36).slice(2)}@example.com`, password: 'a-long-enough-password' })
  return { db, user }
}

process.env.AMBORAS_LOG_LEVEL = 'error'
