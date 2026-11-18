import { Suspense, useState, useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, ContactShadows, Environment, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { sb, DOMAINS } from './supabase'
import './styles.css'

const COLORS = [
  { id: 'coral', name: 'Coral', hex: '#f0655a', vibe: 'Playful' },
  { id: 'rust', name: 'Rust', hex: '#b5472a', vibe: 'Retro' },
  { id: 'beige', name: 'Beige', hex: '#d8c3a5', vibe: 'Clean' },
  { id: 'camel', name: 'Camel', hex: '#b8885a', vibe: 'Warm' },
  { id: 'navy', name: 'Navy Blue', hex: '#1f3560', vibe: 'Classic' },
  { id: 'purple', name: 'Purple', hex: '#6a2c91', vibe: 'Regal' },
  { id: 'lilac', name: 'Lilac', hex: '#b9a3d6', vibe: 'Soft' },
  { id: 'deepgreen', name: 'Deep Green', hex: '#163d28', vibe: 'Rich' },
  { id: 'midnight', name: 'Midnight Blue', hex: '#0f1a38', vibe: 'Night' },
  { id: 'black', name: 'Black', hex: '#1a1a1a', vibe: 'Stealth' },
  { id: 'babyblue', name: 'Baby Blue', hex: '#a9cdf0', vibe: 'Fresh' },
  { id: 'emerald', name: 'Emerald', hex: '#159a5a', vibe: 'Bold' },
  { id: 'forest', name: 'Forest Green', hex: '#2e6b43', vibe: 'Wild' },
]
const byId = (id) => COLORS.find((c) => c.id === id)
const MODEL_URL = import.meta.env.BASE_URL + 'hoodie.glb'
useGLTF.preload(MODEL_URL)

function Hoodie({ hex, finish }) {
  const g = useRef()
  const { scene } = useGLTF(MODEL_URL)
  const target = useMemo(() => new THREE.Color(), [])
  const white = useMemo(() => new THREE.Color('#ffffff'), [])
  // one cloth material for the whole model: sheen gives the soft fabric edge-glow
  const M = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#1a1a1a', roughness: 0.92, sheen: 1, sheenRoughness: 0.55, side: THREE.DoubleSide }), [])
  const model = useMemo(() => {
    const m = scene.clone(true)
    m.traverse((o) => { if (o.isMesh) o.material = M })
    const box = new THREE.Box3().setFromObject(m)
    const size = box.getSize(new THREE.Vector3())
    const c = box.getCenter(new THREE.Vector3())
    const s = 3 / size.x // fit width (sleeve to sleeve) to 3 units
    m.scale.setScalar(s)
    m.position.copy(c).multiplyScalar(-s)
    return m
  }, [scene, M])
  useFrame((st, dt) => {
    M.color.lerp(target.set(hex), 1 - Math.exp(-dt * 8))
    M.sheenColor.copy(M.color).lerp(white, 0.45)
    M.roughness = THREE.MathUtils.lerp(M.roughness, finish === 'satin' ? 0.4 : 0.92, 0.1)
    g.current.position.y = Math.sin(st.clock.elapsedTime) * 0.035
  })
  return <group ref={g}><primitive object={model} /></group>
}

// pull the camera back on narrow (portrait) stages so the sleeves never get cropped
function Fit() {
  const { camera, size } = useThree()
  useEffect(() => {
    camera.position.setLength(Math.min(8, 5.6 * Math.max(1, 1.3 / (size.width / size.height))))
  }, [camera, size.width, size.height])
  return null
}

function Scene({ hex, finish, spin, onGrab }) {
  return (
    <Canvas camera={{ position: [0, 0.4, 5.6], fov: 32 }} dpr={[1, 2]}>
      <Fit />
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 4, 5]} intensity={1.6} />
      <directionalLight position={[-4, 2, -3]} intensity={0.7} color="#b9a3ff" />
      <Environment preset="city" environmentIntensity={0.6} />
      <Suspense fallback={null}><Hoodie hex={hex} finish={finish} /></Suspense>
      <group position={[0, -1.3, 0]}>
        <mesh><cylinderGeometry args={[1.7, 1.8, 0.08, 64]} /><meshStandardMaterial color="#17121f" roughness={0.35} metalness={0.7} /></mesh>
        <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.55, 1.62, 64]} /><meshBasicMaterial color="#ffb23e" toneMapped={false} /></mesh>
      </group>
      <ContactShadows position={[0, -1.25, 0]} opacity={0.55} blur={2.5} scale={6} far={2} />
      <OrbitControls enablePan={false} enableDamping minDistance={3.6} maxDistance={9} minPolarAngle={0.6} maxPolarAngle={2.2}
        target={[0, 0.1, 0]} autoRotate={spin} autoRotateSpeed={1.6} onStart={onGrab} />
    </Canvas>
  )
}

export default function App() {
  const [phase, setPhase] = useState(sb ? 'boot' : 'lobby') // boot | login | lobby | done
  const [picks, setPicks] = useState([])
  const [hover, setHover] = useState(null)
  const [focus, setFocus] = useState(null)
  const [finish, setFinish] = useState('matte')
  const [spin, setSpin] = useState(true)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [msg, setMsg] = useState({ t: '', err: false })
  const say = (t, err = false) => setMsg({ t, err })
  const cur = byId(hover || focus || picks[0] || 'black')

  const afterAuth = async () => {
    const { data } = await sb.from('votes').select('picks').maybeSingle()
    if (data) { setPicks(data.picks); setFocus(data.picks[0]); setPhase('done') } else setPhase('lobby')
  }
  useEffect(() => {
    if (!sb) return
    sb.auth.getSession().then(({ data: { session } }) => (session ? afterAuth() : setPhase('login')))
  }, [])

  const toggle = (id) => {
    if (phase === 'done') return
    if (picks.includes(id)) { const n = picks.filter((x) => x !== id); setPicks(n); setFocus(n.at(-1) || null); say('') }
    else if (picks.length < 3) { setPicks([...picks, id]); setFocus(id); say('') }
    else { setFocus(id); say('You have 3 picks. Remove one to swap.', true) }
  }
  const submit = async () => {
    say('Locking in...')
    if (sb) {
      const { error } = await sb.from('votes').insert({ picks })
      if (error?.code === '23505') return afterAuth()
      if (error) return say(error.message, true)
    }
    say(''); setPhase('done')
  }
  const sendCode = async () => {
    const e = email.trim().toLowerCase()
    if (!DOMAINS.includes(e.split('@')[1])) return say('Use your institute email.', true)
    say('Sending code...')
    const { error } = await sb.auth.signInWithOtp({ email: e })
    if (error) return say(error.message, true)
    setEmail(e); setSent(true); say('Code sent. Check your inbox.')
  }
  const verify = async () => {
    const { error } = await sb.auth.verifyOtp({ email, token: code.trim(), type: 'email' })
    if (error) return say(error.message, true)
    say(''); afterAuth()
  }

  return (
    <div className="lobby" style={{ '--c': cur.hex }}>
      <header className="top">
        <div className="brand"><b>IIIT-H UG2K25</b><span>Batch Hoodie</span></div>
        <div className="chips">
          {!sb && <span className="chip warn">Demo mode</span>}
          <span className="chip">{phase === 'done' ? 'Vote locked' : `${picks.length}/3 picked`}</span>
        </div>
      </header>

      <aside className="panel colors">
        <h2>Colorways <small>{COLORS.length}</small></h2>
        <div className="cards">
          {COLORS.map((c) => {
            const i = picks.indexOf(c.id)
            return (
              <button key={c.id} className={'card' + (i > -1 ? ' on' : '')} onClick={() => toggle(c.id)}
                onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(c.id)} onPointerLeave={() => setHover(null)}
                onFocus={(e) => e.target.matches(':focus-visible') && setHover(c.id)} onBlur={() => setHover(null)} aria-pressed={i > -1}>
                <span className="swatch" style={{ background: c.hex }}>{i > -1 && <i>{i + 1}</i>}</span>
                <b>{c.name}</b><small>{c.vibe}</small>
              </button>
            )
          })}
        </div>
        <p className="tip">Hover to preview. Tap to pick. First pick scores highest.</p>
      </aside>

      <main className="stage">
        <Scene hex={cur.hex} finish={finish} spin={spin} onGrab={() => setSpin(false)} />
        <div className="name"><small>{cur.vibe}</small><b>{cur.name}</b><span>{cur.hex.toUpperCase()}</span></div>
        <div className="tools">
          <button className={spin ? 'act' : ''} onClick={() => setSpin(!spin)}>Auto-rotate</button>
          <button className={finish === 'satin' ? 'act' : ''} onClick={() => setFinish(finish === 'matte' ? 'satin' : 'matte')}>
            Finish: {finish}
          </button>
        </div>

        <section className="panel loadout">
          <h2>{phase === 'done' ? 'Vote locked in' : 'Your top 3'}</h2>
          {[0, 1, 2].map((i) => {
            const c = byId(picks[i])
            return (
              <button key={i} className={'slot' + (c ? ' on' : '')} disabled={!c || phase === 'done'} onClick={() => c && toggle(c.id)}>
                <b>{['1st', '2nd', '3rd'][i]}</b>
                {c ? <><span className="dot" style={{ background: c.hex }} /><span className="nm">{c.name}</span></> : <em>Empty slot</em>}
              </button>
            )
          })}
          {phase === 'done'
            ? <><p className="tip">Thanks! Results will be shared once voting closes.</p>
                {sb && <button className="go ghost" onClick={async () => { await sb.auth.signOut(); location.reload() }}>Sign out</button>}</>
            : <button className="go" disabled={picks.length < 3} onClick={submit}>Lock in vote</button>}
          <p className={'msg' + (msg.err ? ' err' : '')}>{phase === 'login' ? '' : msg.t}</p>
        </section>
      </main>

      {phase === 'login' && (
        <div className="gate">
          <div className="panel box">
            <h2>Sign in to vote</h2>
            <p className="tip">Use your institute email. One vote per student.</p>
            {!sent
              ? <><input type="email" placeholder="you@students.iiit.ac.in" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendCode()} />
                  <button className="go" onClick={sendCode}>Send login code</button></>
              : <><input inputMode="numeric" maxLength={8} placeholder="Code from email" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && verify()} />
                  <button className="go" onClick={verify}>Enter lobby</button></>}
            <p className={'msg' + (msg.err ? ' err' : '')}>{msg.t}</p>
          </div>
        </div>
      )}
    </div>
  )
}