import { useState, useEffect, useRef } from 'react'
import './App.css'
import { supabase, initSupabaseClient, clearSupabaseConfig } from './supabaseClient'

function App() {
  // ---- User Roles & Auth State ----
  const [currentUser, setCurrentUser] = useState({
    role: 'Guest',
    name: 'Guest User',
    username: '',
    email: '',
    avatar: '👤'
  })

  // List of all registered users loaded from /users.json
  const [registeredUsers, setRegisteredUsers] = useState([])

  // Navigation State: 'home' | 'watchlist' | 'admin' | 'users'
  const [currentTab, setCurrentTab] = useState('home')

  // Modals
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState('login') // 'login' | 'register'
  const [authError, setAuthError] = useState('') // For Error Handling requirement
  const [showSupabaseModal, setShowSupabaseModal] = useState(false)
  const [guestWarningModal, setGuestWarningModal] = useState({
    show: false,
    title: '',
    message: ''
  })
  const [notification, setNotification] = useState(null)

  // Supabase Configuration State
  const [sbConfig, setSbConfig] = useState({
    url: localStorage.getItem('scary_supabase_url') || import.meta.env.VITE_SUPABASE_URL || '',
    key: localStorage.getItem('scary_supabase_key') || import.meta.env.VITE_SUPABASE_ANON_KEY || ''
  })
  const [activeSupabase, setActiveSupabase] = useState(supabase)

  // Register Form State (Sign Up requirement)
  const [regForm, setRegForm] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    genres: [],
    acceptTerms: false
  })

  // Login Form State (Login requirement)
  const [loginForm, setLoginForm] = useState({
    emailOrUser: '',
    password: '',
    rememberMe: false
  })

  // ---- Movies & Filter State ----
  const [allMovies, setAllMovies] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [category, setCategory] = useState('All')
  const [categoriesList, setCategoriesList] = useState(['สยองขวัญ', 'ระทึกขวัญ', 'ลึกลับ', 'ตลกร้าย'])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [warning, setWarning] = useState('')
  const [hasSearched, setHasSearched] = useState(false)

  // User-specific states (Favorites & Ratings)
  const [watchlist, setWatchlist] = useState([])
  const [userRatings, setUserRatings] = useState({})

  // Admin New Movie Form
  const [newMovie, setNewMovie] = useState({
    name: '',
    year: new Date().getFullYear(),
    category: 'สยองขวัญ',
    image: '',
    summary: '',
    link: '',
    recommended: false,
    rating: 4.5
  })
  const [newCategoryName, setNewCategoryName] = useState('')

  const debounceTimer = useRef(null)

  // ========================================================
  // 5. จัดการ Session (Session Persistence) & Initial Load
  // ========================================================
  useEffect(() => {
    loadMovies()
    loadUsers()

    // 1) จัดการ Session ผ่าน Supabase Auth จริง (ถ้ามีการเชื่อมต่อ)
    if (activeSupabase) {
      activeSupabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          syncSupabaseUser(session.user)
        }
      }).catch(err => console.warn('Supabase getSession error:', err))

      const { data: { subscription } } = activeSupabase.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
          syncSupabaseUser(session.user)
        } else if (event === 'SIGNED_OUT') {
          handleLogout(false)
        }
      })

      return () => subscription?.unsubscribe()
    } else {
      // 2) จัดการ Session Persistence ผ่าน localStorage (เมื่อไม่มี Supabase)
      const savedSession = localStorage.getItem('scary_current_user')
      if (savedSession) {
        try {
          setCurrentUser(JSON.parse(savedSession))
        } catch (e) {
          console.error(e)
        }
      }
    }
  }, [activeSupabase])

  // Helper เพื่อดึง Storage Key แยกเฉพาะบัญชีผู้ใช้แต่ละคน
  const getUserStorageKey = (prefix, user) => {
    if (!user || user.role === 'Guest') return `${prefix}_guest`
    const identifier = user.id || user.username || user.email || user.role
    return `${prefix}_${identifier}`
  }

  // โหลด Watchlist และ Ratings แยกเฉพาะตามบัญชีที่เข้าสู่ระบบ
  useEffect(() => {
    if (currentUser.role === 'Guest') {
      setWatchlist([])
      setUserRatings({})
      return
    }

    const userWatchlistKey = getUserStorageKey('scary_watchlist', currentUser)
    const savedWatchlist = localStorage.getItem(userWatchlistKey)
    if (savedWatchlist) {
      try {
        setWatchlist(JSON.parse(savedWatchlist))
      } catch (e) {
        setWatchlist([])
      }
    } else {
      setWatchlist([])
    }

    const userRatingsKey = getUserStorageKey('scary_ratings', currentUser)
    const savedRatings = localStorage.getItem(userRatingsKey)
    if (savedRatings) {
      try {
        setUserRatings(JSON.parse(savedRatings))
      } catch (e) {
        setUserRatings({})
      }
    } else {
      setUserRatings({})
    }
  }, [currentUser.id, currentUser.username, currentUser.email, currentUser.role])

  const syncSupabaseUser = (sbUser) => {
    const meta = sbUser.user_metadata || {}
    const userData = {
      id: sbUser.id,
      role: meta.role || (sbUser.email?.includes('admin') ? 'Admin' : 'Member'),
      name: meta.name || sbUser.email.split('@')[0],
      username: meta.username || sbUser.email.split('@')[0],
      email: sbUser.email,
      avatar: meta.avatar || (meta.role === 'Admin' ? '👑' : '🩸'),
      favoriteGenres: meta.favoriteGenres || []
    }
    setCurrentUser(userData)
    localStorage.setItem('scary_current_user', JSON.stringify(userData))
  }

  // Load Movies from /movies.json
  const loadMovies = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/movies.json?t=' + Date.now())
      if (!res.ok) throw new Error('ไม่สามารถดึงข้อมูลภาพยนตร์ได้')
      const data = await res.json()
      setAllMovies(data)

      const dynamicCategories = new Set(['สยองขวัญ', 'ระทึกขวัญ', 'ลึกลับ', 'ตลกร้าย'])
      data.forEach(item => {
        if (item.movie && item.movie.category) {
          dynamicCategories.add(item.movie.category)
        }
      })
      setCategoriesList(Array.from(dynamicCategories))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Load Registered Users from /users.json
  const loadUsers = async () => {
    try {
      const res = await fetch('/users.json?t=' + Date.now())
      if (res.ok) {
        const users = await res.json()
        setRegisteredUsers(users)
      }
    } catch (err) {
      console.warn('Could not fetch users.json:', err)
    }
  }

  const showToast = (msg) => {
    setNotification(msg)
    setTimeout(() => {
      setNotification(null)
    }, 4500)
  }

  // ========================================================
  // 6. ออกจากระบบ (Logout): ออกจากระบบได้จริงและกลับสู่สถานะ Guest
  // ========================================================
  const handleLogout = async (triggerSupabase = true) => {
    if (activeSupabase && triggerSupabase) {
      try {
        await activeSupabase.auth.signOut()
      } catch (err) {
        console.warn('Supabase signOut error:', err)
      }
    }

    const guestUser = {
      role: 'Guest',
      name: 'Guest User',
      username: '',
      email: '',
      avatar: '👤'
    }
    setCurrentUser(guestUser)
    localStorage.removeItem('scary_current_user')
    if (currentTab === 'admin' || currentTab === 'watchlist' || currentTab === 'users') {
      setCurrentTab('home')
    }
    showToast('👋 ออกจากระบบเรียบร้อยแล้ว (กลับสู่สถานะ Guest)')
  }

  // ========================================================
  // 1. สมัครสมาชิก (Sign Up): เชื่อม Supabase Auth จริง
  // ========================================================
  const handleRegisterSubmit = async (e) => {
    e.preventDefault()
    setAuthError('')

    if (!regForm.name || !regForm.username || !regForm.email || !regForm.password) {
      setAuthError('กรุณากรอกข้อมูลสำคัญให้ครบถ้วน')
      return
    }
    if (regForm.password !== regForm.confirmPassword) {
      setAuthError('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน')
      return
    }
    if (regForm.password.length < 6) {
      setAuthError('รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร')
      return
    }
    if (!regForm.acceptTerms) {
      setAuthError('กรุณายอมรับเงื่อนไขและนโยบายความเป็นส่วนตัว')
      return
    }

    // กรณีมี Supabase Client ทำการสมัครผ่าน Supabase Auth จริง!
    if (activeSupabase) {
      try {
        const { data, error: sbError } = await activeSupabase.auth.signUp({
          email: regForm.email.trim(),
          password: regForm.password,
          options: {
            data: {
              name: regForm.name.trim(),
              username: regForm.username.trim(),
              role: 'Member',
              avatar: '🩸',
              favoriteGenres: regForm.genres
            }
          }
        })

        if (sbError) {
          // 4. จัดการข้อผิดพลาด (Error Handling)
          setAuthError(`Supabase Auth Error: ${sbError.message}`)
          showToast(`❌ สมัครสมาชิกไม่สำเร็จ: ${sbError.message}`)
          return
        }

        if (data?.user) {
          syncSupabaseUser(data.user)
          setShowAuthModal(false)
          setGuestWarningModal({ show: false, title: '', message: '' })
          showToast(`🎉 เชื่อมต่อ Supabase สำเร็จ! สมัครสมาชิกและเข้าสู่ระบบเรียบร้อย`)
        } else {
          showToast(`📩 ตรวจสอบอีเมลเพื่อยืนยันตัวตน (หาก Supabase เปิดฟังก์ชัน Confirm Email)`)
          setShowAuthModal(false)
        }
        return
      } catch (err) {
        setAuthError(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ Supabase')
        return
      }
    }

    // กรณีไม่มี Supabase ให้บันทึกลง public/users.json
    const payload = {
      name: regForm.name.trim(),
      username: regForm.username.trim(),
      email: regForm.email.trim(),
      password: regForm.password,
      role: 'Member',
      avatar: '🩸',
      favoriteGenres: regForm.genres
    }

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await res.json()

      if (!res.ok) {
        // 4. จัดการข้อผิดพลาด (Error Handling)
        setAuthError(data.message || 'ไม่สามารถสมัครสมาชิกได้')
        return
      }

      const createdUser = data.user
      setRegisteredUsers([...registeredUsers, createdUser])
      setCurrentUser(createdUser)
      localStorage.setItem('scary_current_user', JSON.stringify(createdUser))

      setShowAuthModal(false)
      setGuestWarningModal({ show: false, title: '', message: '' })

      setRegForm({
        name: '',
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
        genres: [],
        acceptTerms: false
      })

      showToast(`🎉 สมัครสมาชิกสำเร็จ! บันทึกลง users.json ยินดีต้อนรับคุณ ${createdUser.name}`)
    } catch (err) {
      setAuthError('เกิดข้อผิดพลาดในการเชื่อมต่อ API สมัครสมาชิก')
    }
  }

  // ========================================================
  // 2. เข้าสู่ระบบ (Login): ตรวจสอบ Email และ Password ผ่าน Supabase Auth จริง
  // ========================================================
  const handleLoginSubmit = async (e) => {
    e.preventDefault()
    setAuthError('')

    const input = loginForm.emailOrUser.trim()
    const pass = loginForm.password

    if (!input || !pass) {
      setAuthError('กรุณากรอกอีเมลและรหัสผ่าน')
      return
    }

    // กรณีเชื่อมต่อ Supabase Auth จริง!
    if (activeSupabase) {
      try {
        const { data, error: sbError } = await activeSupabase.auth.signInWithPassword({
          email: input,
          password: pass
        })

        if (sbError) {
          // 4. จัดการข้อผิดพลาด (Error Handling)
          setAuthError(`Supabase Auth Error: ${sbError.message}`)
          showToast(`❌ เข้าสู่ระบบไม่สำเร็จ: ${sbError.message}`)
          return
        }

        if (data?.user) {
          syncSupabaseUser(data.user)
          setShowAuthModal(false)
          setGuestWarningModal({ show: false, title: '', message: '' })
          showToast(`🩸 เข้าสู่ระบบผ่าน Supabase สำเร็จ! สวัสดีคุณ ${currentUser.name}`)
        }
        return
      } catch (err) {
        setAuthError(err.message || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบผ่าน Supabase')
        return
      }
    }

    // กรณีตรวจสอบผ่าน users.json (Local Mock)
    const matched = registeredUsers.find(u => 
      (u.username.toLowerCase() === input.toLowerCase() || u.email.toLowerCase() === input.toLowerCase()) &&
      u.password === pass
    )

    if (matched) {
      setCurrentUser(matched)
      if (loginForm.rememberMe) {
        localStorage.setItem('scary_current_user', JSON.stringify(matched))
      }
      setShowAuthModal(false)
      setGuestWarningModal({ show: false, title: '', message: '' })
      showToast(`🩸 เข้าสู่ระบบสำเร็จ! สวัสดีคุณ ${matched.name} (${matched.role})`)
    } else {
      // 4. จัดการข้อผิดพลาด (Error Handling)
      setAuthError('อีเมล/ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง (ลองตรวจสอบข้อมูลใน users.json)')
    }
  }

  // Save Supabase Configuration
  const handleSaveSupabaseConfig = (e) => {
    e.preventDefault()
    if (!sbConfig.url || !sbConfig.key) {
      clearSupabaseConfig()
      setActiveSupabase(null)
      showToast('ยกเลิกการเชื่อมต่อ Supabase (ใช้โหมด Local users.json)')
      setShowSupabaseModal(false)
      return
    }

    try {
      const client = initSupabaseClient(sbConfig.url.trim(), sbConfig.key.trim())
      setActiveSupabase(client)
      showToast('⚡ เชื่อมต่อ Supabase Project สำเร็จเรียบร้อยแล้ว!')
      setShowSupabaseModal(false)
    } catch (err) {
      showToast('❌ ไม่สามารถเชื่อมต่อ Supabase URL นี้ได้')
    }
  }

  // Quick switch between template roles
  const switchRole = (newRole) => {
    if (newRole === 'Guest') {
      handleLogout()
    } else {
      const found = registeredUsers.find(u => u.role === newRole)
      if (found) {
        setCurrentUser(found)
        localStorage.setItem('scary_current_user', JSON.stringify(found))
        showToast(`เข้าสู่ระบบในฐานะ ${found.name} (${found.role}) สำเร็จ!`)
      } else {
        const fallback = {
          role: newRole,
          name: newRole === 'Admin' ? 'Admin Vlad' : 'Member Alex',
          username: newRole.toLowerCase(),
          email: `${newRole.toLowerCase()}@scaryseries.com`,
          avatar: newRole === 'Admin' ? '👑' : '🩸'
        }
        setCurrentUser(fallback)
        localStorage.setItem('scary_current_user', JSON.stringify(fallback))
        showToast(`สลับโหมดเป็น ${newRole} เรียบร้อย!`)
      }
    }
  }

  // Check Guest permission helper
  const requireMemberOrAdmin = (actionName) => {
    if (currentUser.role === 'Guest') {
      setGuestWarningModal({
        show: true,
        title: '🔒 สิทธิ์เฉพาะสมาชิก (Member Required)',
        message: `คุณอยู่ในโหมด "Guest" จึงไม่สามารถ ${actionName} ได้ กรุณาสมัครเป็น Member เพื่อปลดล็อกฟีเจอร์นี้และดูภาพยนตร์ทั้งหมด!`
      })
      return false
    }
    return true
  }

  // Toggle Favorite (แยกตามบัญชีผู้ใช้)
  const toggleFavorite = (e, movie) => {
    e.preventDefault()
    e.stopPropagation()

    if (!requireMemberOrAdmin('เพิ่มภาพยนตร์ใน Watchlist (Favorite)')) {
      return
    }

    const userWatchlistKey = getUserStorageKey('scary_watchlist', currentUser)
    let updated
    const isFav = watchlist.some(m => m.movie.id === movie.movie.id)
    if (isFav) {
      updated = watchlist.filter(m => m.movie.id !== movie.movie.id)
      showToast(`นำ "${movie.movie.name}" ออกจาก Watchlist แล้ว`)
    } else {
      updated = [...watchlist, movie]
      showToast(`❤️ บันทึก "${movie.movie.name}" ลง Watchlist แล้ว!`)
    }
    setWatchlist(updated)
    localStorage.setItem(userWatchlistKey, JSON.stringify(updated))
  }

  // Rate Movie (แยกตามบัญชีผู้ใช้)
  const handleRateMovie = (e, movieId, star) => {
    e.preventDefault()
    e.stopPropagation()

    if (!requireMemberOrAdmin('ให้คะแนนรีวิวภาพยนตร์')) {
      return
    }

    const userRatingsKey = getUserStorageKey('scary_ratings', currentUser)
    const updated = { ...userRatings, [movieId]: star }
    setUserRatings(updated)
    localStorage.setItem(userRatingsKey, JSON.stringify(updated))
    showToast(`⭐ คุณให้คะแนน ${star} ดาว สำหรับเรื่องนี้!`)
  }

  // Click Movie Card for Details
  const handleCardClick = (e, movie) => {
    if (currentUser.role === 'Guest') {
      e.preventDefault()
      requireMemberOrAdmin('คลิกเข้าดูข้อมูลฉบับเต็มและลิงก์รายละเอียดของภาพยนตร์')
      return
    }
  }

  // Search logic
  const handleSearchSubmit = (e) => {
    e.preventDefault()
    const trimmed = searchTerm.trim()
    if (!trimmed && category === 'All') {
      setWarning('กรุณากรอกชื่อภาพยนตร์ หรือเลือกหมวดหมู่ที่ต้องการค้นหา')
      return
    }
    setWarning('')
    setHasSearched(true)
  }

  // Category change for Guest check
  const handleCategoryChange = (e) => {
    const val = e.target.value
    if (currentUser.role === 'Guest' && val !== 'All') {
      requireMemberOrAdmin('เลือกกรองหมวดหมู่ภาพยนตร์')
      return
    }
    setCategory(val)
    setHasSearched(true)
  }

  // Filtered movies
  const getFilteredMovies = () => {
    let result = allMovies

    const trimmed = searchTerm.trim().toLowerCase()
    if (trimmed) {
      result = result.filter(item =>
        item.movie.name.toLowerCase().includes(trimmed)
      )
    }

    if (category !== 'All') {
      result = result.filter(item => item.movie.category === category)
    }

    // Role-based limitation: Guest sees only up to 10 movies!
    if (currentUser.role === 'Guest') {
      result = result.slice(0, 10)
    }

    return result
  }

  // Recommended Movies list
  const getRecommendedMovies = () => {
    let list = allMovies.filter(item => item.movie.recommended)
    if (currentUser.role === 'Guest') {
      list = list.slice(0, 10)
    }
    return list
  }

  // Add New Category (Admin)
  const handleAddCategory = (e) => {
    e.preventDefault()
    const trimmed = newCategoryName.trim()
    if (!trimmed) return
    if (categoriesList.includes(trimmed)) {
      showToast('หมวดหมู่นี้มีอยู่ในระบบแล้ว')
      return
    }
    const updated = [...categoriesList, trimmed]
    setCategoriesList(updated)
    setNewCategoryName('')
    showToast(`✅ เพิ่มหมวดหมู่ "${trimmed}" สำเร็จแล้ว!`)
  }

  // Add New Movie & Save to movies.json (Admin)
  const handleAddNewMovie = async (e) => {
    e.preventDefault()
    if (!newMovie.name.trim()) {
      showToast('กรุณาระบุชื่อภาพยนตร์')
      return
    }

    const nextId = allMovies.length > 0 ? Math.max(...allMovies.map(m => m.movie.id)) + 1 : 1
    const movieObj = {
      movie: {
        id: nextId,
        name: newMovie.name.trim(),
        year: Number(newMovie.year) || new Date().getFullYear(),
        category: newMovie.category,
        image: newMovie.image.trim() || 'https://images.unsplash.com/photo-1505635552518-3448ff116af3?w=300&h=450&fit=crop',
        summary: newMovie.summary.trim() || 'ไม่มีข้อมูลเรื่องย่อ',
        link: newMovie.link.trim() || 'https://en.wikipedia.org/wiki/Horror_film',
        recommended: Boolean(newMovie.recommended),
        rating: Number(newMovie.rating) || 4.5
      }
    }

    const updatedMovies = [movieObj, ...allMovies]
    setAllMovies(updatedMovies)

    try {
      const res = await fetch('/api/save-movies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedMovies)
      })
      if (res.ok) {
        showToast(`🎉 เพิ่ม "${newMovie.name}" และบันทึกลง public/movies.json แล้ว!`)
      } else {
        showToast(`⚠️ เพิ่มภาพยนตร์แล้ว (บันทึกใน State สำเร็จ)`)
      }
    } catch (err) {
      console.warn('Backend save API fallback:', err)
      showToast(`🎉 เพิ่ม "${newMovie.name}" ในระบบเรียบร้อย!`)
    }

    setNewMovie({
      name: '',
      year: new Date().getFullYear(),
      category: categoriesList[0] || 'สยองขวัญ',
      image: '',
      summary: '',
      link: '',
      recommended: false,
      rating: 4.5
    })
  }

  const displayedMovies = getFilteredMovies()
  const recommendedList = getRecommendedMovies()

  // Movie Card Component
  const MovieCard = ({ item }) => {
    const isFav = watchlist.some(m => m.movie.id === item.movie.id)
    const currentRating = userRatings[item.movie.id] || item.movie.rating || 0

    return (
      <div 
        className="movie-card clickable-card"
        onClick={(e) => handleCardClick(e, item)}
      >
        <div className="card-image-wrapper">
          {item.movie.image ? (
            <img 
              src={item.movie.image} 
              alt={item.movie.name} 
              className="movie-image" 
              onError={(e) => {
                e.target.onerror = null
                e.target.src = 'https://images.unsplash.com/photo-1505635552518-3448ff116af3?w=300&h=450&fit=crop'
              }}
            />
          ) : (
            <div className="no-image">No Image</div>
          )}

          <div className="card-overlay">
            <span className="movie-year">{item.movie.year || 'ไม่ระบุปี'}</span>
          </div>

          {item.movie.recommended && (
            <div className="recommended-badge">★ แนะนำ</div>
          )}

          {/* Favorite Heart Button */}
          <button 
            type="button"
            className={`fav-btn ${isFav ? 'active' : ''}`}
            title={isFav ? 'ลบออกจาก Watchlist' : 'เพิ่มใน Watchlist'}
            onClick={(e) => toggleFavorite(e, item)}
          >
            {isFav ? '❤️' : '🤍'}
          </button>
        </div>

        <div className="card-content">
          <div className="movie-header-flex">
            <h2 className="movie-title">{item.movie.name}</h2>
            <span className="category-tag">{item.movie.category}</span>
          </div>

          {/* Star Rating System */}
          <div className="rating-container" onClick={(e) => e.stopPropagation()}>
            <div className="stars">
              {[1, 2, 3, 4, 5].map((star) => (
                <span 
                  key={star} 
                  className={`star-icon ${Math.round(currentRating) >= star ? 'filled' : ''}`}
                  onClick={(e) => handleRateMovie(e, item.movie.id, star)}
                  title={`ให้ ${star} ดาว`}
                >
                  ★
                </span>
              ))}
            </div>
            <span className="rating-number">
              {Number(currentRating).toFixed(1)} / 5
            </span>
          </div>

          <p className="movie-summary">
            {item.movie.summary ? (
              item.movie.summary.length > 95 
                ? item.movie.summary.substring(0, 95) + '...' 
                : item.movie.summary
            ) : "ไม่มีข้อมูลเรื่องย่อ"}
          </p>

          <a 
            href={currentUser.role === 'Guest' ? '#' : item.movie.link}
            target={currentUser.role === 'Guest' ? '_self' : '_blank'}
            rel="noopener noreferrer"
            className="click-to-detail"
            onClick={(e) => {
              if (currentUser.role === 'Guest') {
                e.preventDefault()
                requireMemberOrAdmin('คลิกเข้าดูข้อมูลฉบับเต็มและลิงก์รายละเอียดของภาพยนตร์')
              }
            }}
          >
            {currentUser.role === 'Guest' ? '🔒 ล็อค (สมัคร Member เพื่อดู)' : 'คลิกดูรายละเอียด ↗'}
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      {/* Toast Notification */}
      {notification && (
        <div className="toast-notification">
          <span>{notification}</span>
        </div>
      )}

      {/* TOPBAR / HEADER NAVIGATION */}
      <nav className="top-nav">
        <div className="brand-logo" onClick={() => setCurrentTab('home')}>
          <span className="scary-nav-logo">🩸 SCARY</span>
          <span className="brand-sub">FINDER</span>
        </div>

        {/* Navigation Tabs */}
        <div className="nav-tabs">
          <button 
            type="button" 
            className={`nav-tab-btn ${currentTab === 'home' ? 'active' : ''}`}
            onClick={() => setCurrentTab('home')}
          >
            🎬 หน้าหลัก
          </button>

          {/* Watchlist Tab (Only for Member and Admin) */}
          {(currentUser.role === 'Member' || currentUser.role === 'Admin') && (
            <button 
              type="button" 
              className={`nav-tab-btn ${currentTab === 'watchlist' ? 'active' : ''}`}
              onClick={() => setCurrentTab('watchlist')}
            >
              ❤️ Watchlist ของฉัน ({watchlist.length})
            </button>
          )}

          {/* Admin Tabs & Controls (Only for Admin) */}
          {currentUser.role === 'Admin' && (
            <>
              <button 
                type="button" 
                className={`nav-tab-btn admin-tab ${currentTab === 'admin' ? 'active' : ''}`}
                onClick={() => setCurrentTab('admin')}
              >
                ⚙️ จัดการระบบ (Admin)
              </button>

              {/* Users List Tab - แสดงเฉพาะในหน้า Admin */}
              <button 
                type="button" 
                className={`nav-tab-btn ${currentTab === 'users' ? 'active' : ''}`}
                onClick={() => { loadUsers(); setCurrentTab('users'); }}
              >
                👥 บัญชีในระบบ ({registeredUsers.length})
              </button>

              {/* Supabase Connection Status - แสดงเฉพาะในหน้า Admin */}
              <button 
                type="button" 
                className={`nav-tab-btn supabase-btn ${activeSupabase ? 'connected' : ''}`}
                onClick={() => setShowSupabaseModal(true)}
                title="คลิกเพื่อตั้งค่าหรือดูสถานะ Supabase Auth (สำหรับ Admin)"
              >
                ⚡ {activeSupabase ? 'Supabase (เชื่อมต่อแล้ว)' : 'เชื่อมต่อ Supabase'}
              </button>
            </>
          )}
        </div>

        {/* User Status & Role Switcher */}
        <div className="user-controls">
          {/* Quick Role Switcher Dropdown */}
          <div className="role-dropdown-wrap">
            <span className="role-label">สลับโหมด:</span>
            <select 
              className={`role-select role-${currentUser.role.toLowerCase()}`}
              value={currentUser.role}
              onChange={(e) => switchRole(e.target.value)}
            >
              <option value="Guest">👤 Guest (จำกัด 10 เรื่อง)</option>
              <option value="Member">🩸 Member (ปลดล็อก 30+ เรื่อง)</option>
              <option value="Admin">👑 Admin (เพิ่มหนัง/หมวดหมู่)</option>
            </select>
          </div>

          {/* 3. แสดงข้อมูลสมาชิก (Member Area) & Auth Buttons */}
          {currentUser.role === 'Guest' ? (
            <div className="auth-btns">
              <button 
                type="button" 
                className="btn-login-outline"
                onClick={() => { setAuthError(''); setAuthMode('login'); setShowAuthModal(true); }}
              >
                เข้าสู่ระบบ
              </button>
              <button 
                type="button" 
                className="btn-register-solid"
                onClick={() => { setAuthError(''); setAuthMode('register'); setShowAuthModal(true); }}
              >
                สมัครสมาชิก
              </button>
            </div>
          ) : (
            <div className="profile-pill">
              <span className="avatar-icon">{currentUser.avatar}</span>
              <div className="user-info-text">
                {/* 3. แสดงข้อมูลสมาชิก: ชื่อ / Email */}
                <span className="user-name">{currentUser.name}</span>
                <span className="user-email-sub">{currentUser.email}</span>
                <span className={`user-badge badge-${currentUser.role.toLowerCase()}`}>
                  {currentUser.role}
                </span>
              </div>
              <button 
                type="button" 
                className="btn-logout"
                title="ออกจากระบบ"
                onClick={() => handleLogout(true)}
              >
                ออกจากระบบ 🚪
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* ================= VIEW: HOME ================= */}
      {currentTab === 'home' && (
        <>
          <header className="hero-header">
            <h1>
              <span className="scary-text">SCARY</span> SERIES & MOVIES
            </h1>
            <p className="subtitle">
              คลังภาพยนตร์สยองขวัญ ระทึกขวัญ และตลกร้าย กว่า 30+ เรื่อง
            </p>
            {currentUser.role === 'Guest' && (
              <div className="guest-banner-notice">
                ⚠️ คุณกำลังใช้งานในโหมด <strong>Guest</strong> (รับชมได้จำกัด 10 เรื่อง และไม่สามารถเลือกหมวดหมู่ได้) 
                <button 
                  type="button" 
                  className="inline-register-link"
                  onClick={() => { setAuthError(''); setAuthMode('register'); setShowAuthModal(true); }}
                >
                  สมัคร Member เพื่อปลดล็อก 30+ เรื่อง ➜
                </button>
              </div>
            )}
          </header>

          <main className="main-content">
            {/* Search and Category Form */}
            <form className="search-form" onSubmit={handleSearchSubmit}>
              <div className="input-group">
                <label htmlFor="searchInput" className="sr-only">ค้นหาภาพยนตร์</label>
                <input 
                  id="searchInput"
                  type="text" 
                  placeholder="พิมพ์ค้นหาชื่อภาพยนตร์ (เช่น Scream, Shutter, Scary)..." 
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value)
                    setHasSearched(true)
                  }}
                  className="search-input"
                  autoComplete="off"
                />

                {/* Category Dropdown (Locked for Guest) */}
                <label htmlFor="categorySelect" className="sr-only">เลือกหมวดหมู่</label>
                <div className={`select-wrapper ${currentUser.role === 'Guest' ? 'locked' : ''}`}>
                  <select 
                    id="categorySelect"
                    className="category-select"
                    value={category}
                    onChange={handleCategoryChange}
                    disabled={currentUser.role === 'Guest'}
                    title={currentUser.role === 'Guest' ? 'หมวดหมู่สงวนไว้สำหรับสมาชิก Member เท่านั้น' : 'เลือกหมวดหมู่'}
                  >
                    <option value="All">
                      {currentUser.role === 'Guest' ? '🔒 ล็อคทุกหมวดหมู่ (สำหรับ Member)' : 'ทุกหมวดหมู่ (All Genres)'}
                    </option>
                    {categoriesList.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <button 
                  type="submit" 
                  className="search-button"
                  disabled={loading}
                >
                  {loading ? <span className="spinner"></span> : 'ค้นหา'}
                </button>
              </div>
              {warning && <div className="warning-msg">{warning}</div>}
            </form>

            {/* RESULTS SECTION */}
            <section className="results-container">
              {loading && (
                <div className="status-msg loading">
                  <div className="blood-drop"></div>
                  กำลังดึงข้อมูลความสยองขวัญ...
                </div>
              )}

              {error && (
                <div className="status-msg error">
                  <p>{error}</p>
                  <button className="retry-btn" onClick={loadMovies}>ลองอีกครั้ง</button>
                </div>
              )}

              {/* Empty State */}
              {!loading && !error && hasSearched && displayedMovies.length === 0 && (
                <div className="status-msg empty">
                  <p>ไม่พบภาพยนตร์ที่คุณค้นหา 🦇</p>
                  <small>ลองพิมพ์คำค้นหาอื่น หรือเคลียร์คำค้นเพื่อดูรายการทั้งหมด</small>
                </div>
              )}

              {/* 1. Recommended Section (อยู่ด้านบนสุดเมื่อยังไม่ได้เริ่มค้นหา) */}
              {!loading && !error && !hasSearched && recommendedList.length > 0 && (
                <div className="recommended-section" style={{ marginBottom: '3rem' }}>
                  <h3 className="section-title">🔥 ภาพยนตร์แนะนำยอดนิยม (Recommended)</h3>
                  <div className="movie-grid">
                    {recommendedList.slice(0, currentUser.role === 'Guest' ? 3 : 6).map((item) => (
                      <MovieCard key={`rec-${item.movie.id}`} item={item} />
                    ))}
                  </div>
                </div>
              )}

              {/* 2. Main Movie Grid */}
              {!loading && !error && displayedMovies.length > 0 && (
                <div className="all-movies-section">
                  <div className="section-header-row">
                    <h3 className="section-title">
                      {hasSearched ? `ผลลัพธ์การค้นหา (${displayedMovies.length} เรื่อง)` : `🎬 รายการภาพยนตร์ทั้งหมด (${displayedMovies.length} เรื่อง)`}
                    </h3>
                    {currentUser.role === 'Guest' && (
                      <span className="guest-count-pill">จำกัดการแสดง 10 เรื่อง (Guest)</span>
                    )}
                  </div>

                  <div className="movie-grid">
                    {displayedMovies.map((item) => (
                      <MovieCard key={item.movie.id} item={item} />
                    ))}
                  </div>
                </div>
              )}

              {/* 3. Guest Limitation Warning at the VERY BOTTOM (อยู่ล่างสุดเสมอ) */}
              {!loading && !error && currentUser.role === 'Guest' && displayedMovies.length > 0 && (
                <div className="guest-upgrade-card">
                  <div className="upgrade-icon">🔒</div>
                  <div className="upgrade-content">
                    <h4>คุณกำลังรับชม 10 เรื่องในโหมด Guest</h4>
                    <p>ต้องการรับชมภาพยนตร์สยองขวัญระดับตำนานและเรื่องอื่นๆ ทั้งหมด 30+ เรื่อง พร้อมสิทธิ์การกด Favorite และให้คะแนนหรือไม่?</p>
                  </div>
                  <button 
                    type="button" 
                    className="btn-upgrade-now"
                    onClick={() => { setAuthError(''); setAuthMode('register'); setShowAuthModal(true); }}
                  >
                    สมัครสมาชิกฟรี เพื่อปลดล็อก ➜
                  </button>
                </div>
              )}
            </section>
          </main>
        </>
      )}

      {/* ================= VIEW: WATCHLIST ================= */}
      {currentTab === 'watchlist' && (
        <div className="watchlist-view">
          <header className="page-header">
            <h2>❤️ Watchlist ของฉัน ({currentUser.name})</h2>
            <p className="subtitle">ภาพยนตร์สยองขวัญที่คุณบันทึกไว้ในรายการโปรด</p>
          </header>

          {watchlist.length === 0 ? (
            <div className="empty-watchlist-box">
              <span className="empty-icon">🎬</span>
              <h3>ยังไม่มีภาพยนตร์ใน Watchlist ของคุณ</h3>
              <p>กลับไปที่หน้าหลักแล้วกดปุ่มหัวใจ ❤️ ที่การ์ดภาพยนตร์เพื่อบันทึกไว้ดูภายหลัง</p>
              <button 
                type="button" 
                className="btn-back-home"
                onClick={() => setCurrentTab('home')}
              >
                สำรวจภาพยนตร์ที่หน้าหลัก
              </button>
            </div>
          ) : (
            <div className="movie-grid">
              {watchlist.map((item) => (
                <MovieCard key={`fav-${item.movie.id}`} item={item} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= VIEW: ADMIN DASHBOARD ================= */}
      {currentTab === 'admin' && currentUser.role === 'Admin' && (
        <div className="admin-view">
          <header className="page-header">
            <h2>⚙️ แผงควบคุมผู้ดูแลระบบ (Admin Dashboard)</h2>
            <p className="subtitle">จัดการหมวดหมู่และเพิ่มภาพยนตร์เรื่องใหม่ พร้อมบันทึกลง <code>movies.json</code></p>
          </header>

          <div className="admin-grid-layout">
            {/* 1. Category Management */}
            <div className="admin-card">
              <h3>🏷️ จัดการหมวดหมู่ (Categories)</h3>
              <p className="card-desc">เพิ่มหมวดหมู่ใหม่ให้กับระบบเพื่อใช้จัดกลุ่มภาพยนตร์</p>

              <form onSubmit={handleAddCategory} className="admin-form-row">
                <input 
                  type="text" 
                  placeholder="เช่น ซอมบี้, ไซไฟ-สยองขวัญ, ฆาตกรรม..." 
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="admin-input"
                />
                <button type="submit" className="admin-btn-primary">
                  + เพิ่มหมวดหมู่
                </button>
              </form>

              <div className="current-categories">
                <h4>หมวดหมู่ปัจจุบันในระบบ:</h4>
                <div className="category-chips">
                  {categoriesList.map(cat => (
                    <span key={cat} className="chip">{cat}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* 2. Add New Movie Form */}
            <div className="admin-card span-2">
              <h3>🎬 เพิ่มภาพยนตร์เรื่องใหม่ (Add Movie to movies.json)</h3>
              <p className="card-desc">กรอกข้อมูลภาพยนตร์เพื่อเพิ่มเข้าสู่ระบบ ข้อมูลจะถูกบันทึกจริงลงในไฟล์ <code>public/movies.json</code></p>

              <form onSubmit={handleAddNewMovie} className="add-movie-form">
                <div className="form-group-2col">
                  <div>
                    <label>ชื่อภาพยนตร์ *</label>
                    <input 
                      type="text" 
                      placeholder="เช่น Smile 2, Terrifier 3" 
                      value={newMovie.name}
                      onChange={(e) => setNewMovie({ ...newMovie, name: e.target.value })}
                      className="admin-input"
                      required
                    />
                  </div>
                  <div>
                    <label>ปีที่ฉาย</label>
                    <input 
                      type="number" 
                      value={newMovie.year}
                      onChange={(e) => setNewMovie({ ...newMovie, year: e.target.value })}
                      className="admin-input"
                    />
                  </div>
                </div>

                <div className="form-group-2col">
                  <div>
                    <label>หมวดหมู่</label>
                    <select 
                      value={newMovie.category}
                      onChange={(e) => setNewMovie({ ...newMovie, category: e.target.value })}
                      className="admin-input"
                    >
                      {categoriesList.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>คะแนนเริ่มต้น (1 - 5 ดาว)</label>
                    <input 
                      type="number" 
                      step="0.1" 
                      min="1" 
                      max="5"
                      value={newMovie.rating}
                      onChange={(e) => setNewMovie({ ...newMovie, rating: e.target.value })}
                      className="admin-input"
                    />
                  </div>
                </div>

                <div>
                  <label>URL รูปภาพโปสเตอร์</label>
                  <input 
                    type="url" 
                    placeholder="https://... (หรือเว้นว่างไว้เพื่อใช้รูปเริ่มต้น)" 
                    value={newMovie.image}
                    onChange={(e) => setNewMovie({ ...newMovie, image: e.target.value })}
                    className="admin-input"
                  />
                  <div className="image-presets">
                    <span>หรือคลิกเลือกภาพตัวอย่าง: </span>
                    <button 
                      type="button" 
                      className="preset-btn"
                      onClick={() => setNewMovie({ ...newMovie, image: 'https://upload.wikimedia.org/wikipedia/en/7/7f/Smile_2_film_poster.jpg' })}
                    >
                      Smile 2
                    </button>
                    <button 
                      type="button" 
                      className="preset-btn"
                      onClick={() => setNewMovie({ ...newMovie, image: 'https://upload.wikimedia.org/wikipedia/en/b/b9/Terrifier_3_poster.jpg' })}
                    >
                      Terrifier 3
                    </button>
                  </div>
                </div>

                <div>
                  <label>ลิงก์ข้อมูลเพิ่มเติม (Wikipedia / IMDb)</label>
                  <input 
                    type="url" 
                    placeholder="https://en.wikipedia.org/wiki/..." 
                    value={newMovie.link}
                    onChange={(e) => setNewMovie({ ...newMovie, link: e.target.value })}
                    className="admin-input"
                  />
                </div>

                <div>
                  <label>เรื่องย่อ (Synopsis)</label>
                  <textarea 
                    rows="3"
                    placeholder="อธิบายเนื้อเรื่องย่อของภาพยนตร์..." 
                    value={newMovie.summary}
                    onChange={(e) => setNewMovie({ ...newMovie, summary: e.target.value })}
                    className="admin-input"
                  ></textarea>
                </div>

                <div className="checkbox-wrap">
                  <label>
                    <input 
                      type="checkbox" 
                      checked={newMovie.recommended}
                      onChange={(e) => setNewMovie({ ...newMovie, recommended: e.target.checked })}
                    />
                    <span>⭐ ตั้งเป็นภาพยนตร์แนะนำ (Recommended)</span>
                  </label>
                </div>

                <div className="form-submit-row">
                  <button type="submit" className="btn-save-movie">
                    💾 บันทึกภาพยนตร์ลงระบบ & movies.json
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ================= VIEW: REGISTERED USERS (ADMIN ONLY) ================= */}
      {currentTab === 'users' && currentUser.role === 'Admin' && (
        <div className="users-view">
          <header className="page-header">
            <h2>👥 บัญชีผู้ใช้งานในระบบ</h2>
            <p className="subtitle">
              แสดงข้อมูลบัญชีผู้ใช้งาน {activeSupabase ? '(เชื่อมต่อ Supabase Auth)' : '(เชื่อมต่อผ่าน public/users.json)'}
            </p>
          </header>

          <div className="users-cards-grid">
            {registeredUsers.map((u) => (
              <div key={u.id} className="user-account-card">
                <div className="user-card-top">
                  <span className="user-card-avatar">{u.avatar || '👤'}</span>
                  <div className="user-card-meta">
                    <h4>{u.name}</h4>
                    <span className="user-username">@{u.username}</span>
                  </div>
                  <span className={`user-badge badge-${u.role.toLowerCase()}`}>{u.role}</span>
                </div>

                <div className="user-card-details">
                  <p><strong>อีเมล:</strong> {u.email}</p>
                  <p><strong>รหัสผ่าน:</strong> <code>{u.password}</code></p>
                  {u.favoriteGenres && u.favoriteGenres.length > 0 && (
                    <div className="user-genres-tags">
                      <strong>แนวที่ชอบ:</strong>
                      <div className="genre-badges-wrap">
                        {u.favoriteGenres.map(g => <span key={g} className="genre-mini-badge">{g}</span>)}
                      </div>
                    </div>
                  )}
                  {u.createdAt && (
                    <small className="created-date">สมัครเมื่อ: {new Date(u.createdAt).toLocaleDateString('th-TH')}</small>
                  )}
                </div>

                <div className="user-card-actions">
                  <button 
                    type="button" 
                    className="btn-login-as"
                    onClick={() => {
                      setCurrentUser(u)
                      localStorage.setItem('scary_current_user', JSON.stringify(u))
                      showToast(`สลับใช้งานเป็น ${u.name} (${u.role}) เรียบร้อย!`)
                    }}
                  >
                    เข้าสู่ระบบด้วยบัญชีนี้
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="api-info-box">
            <h4>💡 ข้อมูล Requirement เชื่อม Supabase Auth สำหรับนำเสนออาจารย์:</h4>
            <p>1. <strong>สมัครสมาชิก (Sign Up):</strong> เชื่อมโยง <code>supabase.auth.signUp()</code> ส่ง Email, Password และ Metadata</p>
            <p>2. <strong>เข้าสู่ระบบ (Login):</strong> ตรวจสอบสิทธิ์ผ่าน <code>supabase.auth.signInWithPassword()</code></p>
            <p>3. <strong>แสดงข้อมูลสมาชิก (Member Area):</strong> แสดงชื่อ, Email และ Role บนแถบ Navigation</p>
            <p>4. <strong>จัดการข้อผิดพลาด (Error Handling):</strong> แสดงข้อความเตือนเมื่อกรอกผิด หรือรหัสไม่ตรง</p>
            <p>5. <strong>จัดการ Session (Session Persistence):</strong> ตรวจจับ Session ด้วย <code>supabase.auth.getSession()</code> รีเฟรชแล้วยังคง Login อยู่</p>
            <p>6. <strong>ออกจากระบบ (Logout):</strong> เรียกใช้ <code>supabase.auth.signOut()</code> และรีเซ็ตกลับเป็น Guest ทันที</p>
          </div>
        </div>
      )}

      {/* ================= MODAL: SUPABASE SETTINGS ================= */}
      {showSupabaseModal && (
        <div className="modal-backdrop" onClick={() => setShowSupabaseModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>⚡ ตั้งค่าการเชื่อมต่อ Supabase Auth</h3>
              <button type="button" className="close-modal" onClick={() => setShowSupabaseModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveSupabaseConfig} className="modal-body auth-form">
              <p style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '1rem', textAlign: 'left' }}>
                ใส่ <strong>Project URL</strong> และ <strong>Anon Key</strong> จาก Supabase Dashboard เพื่อเชื่อมต่อระบบ Auth จริง 
                (หรือเว้นว่างไว้หากต้องการใช้โหมด Local <code>users.json</code> จำลอง)
              </p>
              <div className="form-group">
                <label>Supabase Project URL</label>
                <input 
                  type="url"
                  placeholder="https://xyzcompany.supabase.co"
                  value={sbConfig.url}
                  onChange={(e) => setSbConfig({ ...sbConfig, url: e.target.value })}
                  className="auth-input"
                />
              </div>
              <div className="form-group">
                <label>Supabase Anon Key</label>
                <input 
                  type="password"
                  placeholder="eyJh...... (Anon Public Key)"
                  value={sbConfig.key}
                  onChange={(e) => setSbConfig({ ...sbConfig, key: e.target.value })}
                  className="auth-input"
                />
              </div>

              <div className="form-row-between" style={{ marginTop: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', color: activeSupabase ? '#4ade80' : '#f59e0b' }}>
                  สถานะปัจจุบัน: {activeSupabase ? '● เชื่อมต่อ Supabase แล้ว' : '○ ใช้งานโหมด Local (users.json)'}
                </span>
              </div>

              <div className="modal-footer" style={{ padding: '1rem 0 0', background: 'transparent' }}>
                <button type="button" className="btn-outline-modal" onClick={() => setShowSupabaseModal(false)}>
                  ยกเลิก
                </button>
                <button type="submit" className="btn-solid-modal">
                  บันทึกการเชื่อมต่อ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: GUEST WARNING ================= */}
      {guestWarningModal.show && (
        <div className="modal-backdrop" onClick={() => setGuestWarningModal({ show: false, title: '', message: '' })}>
          <div className="modal-box modal-warning" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{guestWarningModal.title}</h3>
              <button 
                type="button" 
                className="close-modal"
                onClick={() => setGuestWarningModal({ show: false, title: '', message: '' })}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="warning-dialog-icon">⚠️</div>
              <p>{guestWarningModal.message}</p>
            </div>
            <div className="modal-footer">
              <button 
                type="button" 
                className="btn-outline-modal"
                onClick={() => {
                  setGuestWarningModal({ show: false, title: '', message: '' })
                  setAuthError('')
                  setAuthMode('login')
                  setShowAuthModal(true)
                }}
              >
                เข้าสู่ระบบ
              </button>
              <button 
                type="button" 
                className="btn-solid-modal"
                onClick={() => {
                  setGuestWarningModal({ show: false, title: '', message: '' })
                  setAuthError('')
                  setAuthMode('register')
                  setShowAuthModal(true)
                }}
              >
                สมัครสมาชิก Member ทันที ➜
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: AUTHENTICATION (LOGIN / REGISTER) ================= */}
      {showAuthModal && (
        <div className="modal-backdrop" onClick={() => setShowAuthModal(false)}>
          <div className="modal-box auth-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="auth-tab-switch">
                <button 
                  type="button" 
                  className={`auth-tab-item ${authMode === 'login' ? 'active' : ''}`}
                  onClick={() => { setAuthError(''); setAuthMode('login'); }}
                >
                  เข้าสู่ระบบ (Login)
                </button>
                <button 
                  type="button" 
                  className={`auth-tab-item ${authMode === 'register' ? 'active' : ''}`}
                  onClick={() => { setAuthError(''); setAuthMode('register'); }}
                >
                  สมัครสมาชิก (Register)
                </button>
              </div>
              <button type="button" className="close-modal" onClick={() => setShowAuthModal(false)}>✕</button>
            </div>

            <div className="modal-body">
              {/* 4. แสดง Error เมื่อสมัครหรือ Login ไม่สำเร็จ (Error Handling) */}
              {authError && (
                <div className="auth-error-banner">
                  <span>⚠️ {authError}</span>
                </div>
              )}

              {/* 2. LOGIN FORM */}
              {authMode === 'login' && (
                <form onSubmit={handleLoginSubmit} className="auth-form">
                  <div className="form-group">
                    <label>อีเมล หรือ ชื่อผู้ใช้</label>
                    <input 
                      type="text" 
                      placeholder={activeSupabase ? 'example@email.com (สำหรับ Supabase)' : 'member_alex หรือ admin_vlad'}
                      value={loginForm.emailOrUser}
                      onChange={(e) => setLoginForm({ ...loginForm, emailOrUser: e.target.value })}
                      className="auth-input"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>รหัสผ่าน</label>
                    <input 
                      type="password" 
                      placeholder="••••••••" 
                      value={loginForm.password}
                      onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                      className="auth-input"
                      required
                    />
                  </div>

                  <div className="form-row-between">
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={loginForm.rememberMe}
                        onChange={(e) => setLoginForm({ ...loginForm, rememberMe: e.target.checked })}
                      />
                      <span>จดจำฉันไว้ในระบบ</span>
                    </label>
                    <a href="#forgot" onClick={(e) => { e.preventDefault(); showToast('ระบบได้ส่งคำแนะนำการรีเซ็ตไปยังอีเมลแล้ว'); }} className="link-muted">
                      ลืมรหัสผ่าน?
                    </a>
                  </div>

                  <button type="submit" className="btn-auth-submit">
                    เข้าสู่ระบบ {activeSupabase ? '(ผ่าน Supabase Auth)' : ''} 🩸
                  </button>

                  <div className="demo-accounts-hint">
                    <span>💡 บัญชีทดสอบที่มีใน users.json:</span>
                    <div className="demo-pill-wrap">
                      <button 
                        type="button" 
                        className="demo-pill"
                        onClick={() => {
                          setAuthError('')
                          setLoginForm({ emailOrUser: 'alex@scaryseries.com', password: 'password123', rememberMe: true })
                        }}
                      >
                        Member: <code>alex@scaryseries.com</code> / <code>password123</code>
                      </button>
                      <button 
                        type="button" 
                        className="demo-pill admin"
                        onClick={() => {
                          setAuthError('')
                          setLoginForm({ emailOrUser: 'admin@scaryseries.com', password: 'admin123', rememberMe: true })
                        }}
                      >
                        Admin: <code>admin@scaryseries.com</code> / <code>admin123</code>
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* 1. DETAILED REGISTER FORM */}
              {authMode === 'register' && (
                <form onSubmit={handleRegisterSubmit} className="auth-form">
                  <div className="form-group-2col">
                    <div className="form-group">
                      <label>ชื่อ-นามสกุล หรือ นามแฝง *</label>
                      <input 
                        type="text" 
                        placeholder="เช่น สมชาย สายหลอน" 
                        value={regForm.name}
                        onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                        className="auth-input"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>ชื่อผู้ใช้ (Username) *</label>
                      <input 
                        type="text" 
                        placeholder="somchai_ghost" 
                        value={regForm.username}
                        onChange={(e) => setRegForm({ ...regForm, username: e.target.value })}
                        className="auth-input"
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>อีเมล (Email) *</label>
                    <input 
                      type="email" 
                      placeholder="somchai@gmail.com" 
                      value={regForm.email}
                      onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                      className="auth-input"
                      required
                    />
                  </div>

                  <div className="form-group-2col">
                    <div className="form-group">
                      <label>รหัสผ่าน (อย่างน้อย 6 ตัวอักษร) *</label>
                      <input 
                        type="password" 
                        placeholder="••••••••" 
                        value={regForm.password}
                        onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                        className="auth-input"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>ยืนยันรหัสผ่าน *</label>
                      <input 
                        type="password" 
                        placeholder="••••••••" 
                        value={regForm.confirmPassword}
                        onChange={(e) => setRegForm({ ...regForm, confirmPassword: e.target.value })}
                        className="auth-input"
                        required
                      />
                    </div>
                  </div>

                  {/* Horror Preferences Checklist */}
                  <div className="form-group">
                    <label>แนวหนังสยองขวัญที่คุณโปรดปราน (เลือกได้หลายข้อ)</label>
                    <div className="genre-checkbox-grid">
                      {['🪓 ฆาตกรต่อเนื่อง (Slasher)', '👻 วิญญาณ / ไล่ผี', '🧠 ระทึกขวัญจิตวิทยา', '🧟 ซอมบี้ / สัตว์ประหลาด', '🤡 ตลกร้ายล้อเลียน'].map(g => (
                        <label key={g} className="genre-checkbox-item">
                          <input 
                            type="checkbox"
                            checked={regForm.genres.includes(g)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setRegForm({ ...regForm, genres: [...regForm.genres, g] })
                              } else {
                                setRegForm({ ...regForm, genres: regForm.genres.filter(item => item !== g) })
                              }
                            }}
                          />
                          <span>{g}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={regForm.acceptTerms}
                        onChange={(e) => setRegForm({ ...regForm, acceptTerms: e.target.checked })}
                        required
                      />
                      <span>ฉันยืนยันว่าอายุ 18+ ปีขึ้นไป และยอมรับข้อกำหนดและนโยบายความเป็นส่วนตัว</span>
                    </label>
                  </div>

                  <button type="submit" className="btn-auth-submit">
                    ยืนยันการสมัครสมาชิก {activeSupabase ? '(เชื่อม Supabase Auth)' : ''} 🩸
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
