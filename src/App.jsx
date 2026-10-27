import { useState, useEffect, useRef } from 'react'
import './App.css'
import { api, API_BASE_URL, tokenStore, fieldErrors } from './apiClient'

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

  // Navigation State: 'home' | 'watchlist' | 'admin' | 'users' | 'api'
  const [currentTab, setCurrentTab] = useState('home')

  // Modals
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState('login') // 'login' | 'register'
  const [authProvider, setAuthProvider] = useState('api') // 'api' | 'local'
  const [authError, setAuthError] = useState('') // For Error Handling requirement
  const [fieldErrorsObj, setFieldErrorsObj] = useState({}) // Field validation errors { email, password, name }
  const [submittingAuth, setSubmittingAuth] = useState(false)
  const [guestWarningModal, setGuestWarningModal] = useState({
    show: false,
    title: '',
    message: ''
  })
  const [notification, setNotification] = useState(null)

  // Cloud Course API State (dev2life Workers)
  const [apiHealth, setApiHealth] = useState(null)
  const [apiLatency, setApiLatency] = useState(null)
  const [apiStatus, setApiStatus] = useState('checking') // 'online' | 'offline' | 'checking'
  const [demoTestResult, setDemoTestResult] = useState(null)
  const [demoTestLoading, setDemoTestLoading] = useState(false)
  const [cloudUsers, setCloudUsers] = useState([])
  const [loadingCloudUsers, setLoadingCloudUsers] = useState(false)

  // Cloud Admin Pagination & Filter States
  const [adminPage, setAdminPage] = useState(1)
  const [adminLimit, setAdminLimit] = useState(10)
  const [adminMeta, setAdminMeta] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 })
  const [adminSearch, setAdminSearch] = useState('')
  const [adminRoleFilter, setAdminRoleFilter] = useState('')
  const [adminStatusFilter, setAdminStatusFilter] = useState('')
  const [adminSort, setAdminSort] = useState('createdAt')
  const [adminOrder, setAdminOrder] = useState('desc')
  const [adminStats, setAdminStats] = useState(null)
  const [testingExpiredToken, setTestingExpiredToken] = useState(false)

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
  const fetchApiHealth = async () => {
    setApiStatus('checking')
    try {
      const res = await api.checkHealth()
      setApiHealth(res.data)
      setApiLatency(res.latency)
      setApiStatus('online')
    } catch (err) {
      console.warn('API Health Check Error:', err)
      setApiStatus('offline')
    }
  }

  const handleTestDemoRoute = async (level) => {
    setDemoTestLoading(true)
    setDemoTestResult(null)
    try {
      const result = await api.testDemoRoute(level)
      setDemoTestResult({ level, success: true, data: result })
      showToast(`✅ ผ่านสิทธิ์ (${level}): ${result.data?.message || 'Authorized'}`)
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'ไม่มีสิทธิ์'
      setDemoTestResult({ level, success: false, error: msg })
      showToast(`❌ ไม่อนุญาต (${level}): ${msg}`)
    } finally {
      setDemoTestLoading(false)
    }
  }

  const fetchAdminStats = async () => {
    try {
      const stats = await api.getAdminStats()
      setAdminStats(stats)
    } catch (err) {
      console.warn('Could not fetch admin stats:', err)
    }
  }

  const fetchCloudUsers = async (pageToLoad = adminPage) => {
    setLoadingCloudUsers(true)
    try {
      const params = {
        page: pageToLoad,
        limit: adminLimit,
        sort: adminSort,
        order: adminOrder
      }
      if (adminSearch.trim()) params.search = adminSearch.trim()
      if (adminRoleFilter) params.role = adminRoleFilter
      if (adminStatusFilter) params.status = adminStatusFilter

      const res = await api.getAdminUsers(params)
      setCloudUsers(res.data || [])
      if (res.meta) {
        setAdminMeta(res.meta)
        setAdminPage(res.meta.page)
      }
      fetchAdminStats()
      showToast(`📥 ดึงรายชื่อผู้ใช้จาก Cloud API เรียบร้อย (หน้า ${pageToLoad})`)
    } catch (err) {
      showToast(`❌ ดึงรายชื่อไม่สำเร็จ: ${err.response?.data?.error?.message || err.message}`)
    } finally {
      setLoadingCloudUsers(false)
    }
  }

  const handleUpdateRole = async (userId, newRole) => {
    try {
      const updated = await api.updateRole(userId, newRole)
      setCloudUsers(prev => prev.map(u => u.id === userId ? { ...u, role: updated.role } : u))
      fetchAdminStats()
      showToast(`✅ เปลี่ยน Role ของ ${updated.name} เป็น ${updated.role} สำเร็จ`)
    } catch (err) {
      showToast(`❌ เปลี่ยน Role ไม่สำเร็จ: ${err.response?.data?.error?.message || err.message}`)
    }
  }

  const handleUpdateStatus = async (userId, newStatus) => {
    try {
      const updated = await api.updateStatus(userId, newStatus)
      setCloudUsers(prev => prev.map(u => u.id === userId ? { ...u, status: updated.status } : u))
      fetchAdminStats()
      showToast(`✅ อัปเดตสถานะของ ${updated.name} เป็น ${updated.status} สำเร็จ`)
    } catch (err) {
      showToast(`❌ อัปเดตสถานะไม่สำเร็จ: ${err.response?.data?.error?.message || err.message}`)
    }
  }

  const handleDeleteCloudUser = async (userId, name) => {
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบบัญชี "${name}" ออกจากระบบ?`)) return
    try {
      await api.deleteUser(userId)
      setCloudUsers(prev => prev.filter(u => u.id !== userId))
      fetchAdminStats()
      showToast(`🗑️ ลบบัญชี "${name}" เรียบร้อย`)
    } catch (err) {
      showToast(`❌ ลบไม่สำเร็จ: ${err.response?.data?.error?.message || err.message}`)
    }
  }

  const handleTestExpiredToken = async () => {
    setTestingExpiredToken(true)
    try {
      const expiredToken = await api.getExpiredToken()
      tokenStore.save({ accessToken: expiredToken })
      showToast('⏰ จำลอง Token หมดอายุแล้ว... กำลังทดสอบเรียก /auth/me')

      // Interceptor จะดักจับ 401 TOKEN_EXPIRED -> เรียก /auth/refresh -> แล้วยิงซ้ำอัตโนมัติ
      const me = await api.getMe()
      showToast(`🎉 Auto-Refresh สำเร็จ! ตรวจพบ TOKEN_EXPIRED และขอ Token ใหม่สำเร็จ ยินดีต้อนรับ ${me.name}`)
    } catch (err) {
      showToast(`❌ ทดสอบ Auto-Refresh ล้มเหลว: ${err.response?.data?.error?.message || err.message}`)
    } finally {
      setTestingExpiredToken(false)
    }
  }

  useEffect(() => {
    loadMovies()
    loadUsers()
    fetchApiHealth()

    // 1) จัดการ Session สำหรับ Cloud Course API ตามมาตรฐาน
    const token = tokenStore.access
    if (token) {
      api.getMe().then(apiUser => {
        const userData = {
          id: apiUser.id,
          role: apiUser.role === 'ADMIN' ? 'Admin' : (apiUser.role === 'EDITOR' ? 'Editor' : 'Member'),
          apiRole: apiUser.role,
          name: apiUser.name,
          username: apiUser.email.split('@')[0],
          email: apiUser.email,
          avatar: apiUser.avatarUrl || (apiUser.role === 'ADMIN' ? '👑' : apiUser.role === 'EDITOR' ? '✍️' : '🩸'),
          authProvider: 'api',
          status: apiUser.status,
          isProtected: apiUser.isProtected
        }
        setCurrentUser(userData)
        localStorage.setItem('scary_current_user', JSON.stringify(userData))
      }).catch(err => {
        const code = err.response?.data?.error?.code
        // ล้าง token เฉพาะเมื่อ Token ไม่ถูกต้อง หรือถูกแบน (ห้าม logout บน network/5xx error)
        if (['TOKEN_INVALID', 'TOKEN_MISSING', 'REFRESH_TOKEN_INVALID', 'ACCOUNT_BANNED'].includes(code)) {
          tokenStore.clear()
          localStorage.removeItem('scary_current_user')
          setCurrentUser({
            role: 'Guest',
            name: 'Guest User',
            username: '',
            email: '',
            avatar: '👤'
          })
        }
      })
    } else {
      // 2) จัดการ Session Persistence ผ่าน localStorage (เมื่อไม่มี Cloud API Token)
      const savedSession = localStorage.getItem('scary_current_user')
      if (savedSession) {
        try {
          setCurrentUser(JSON.parse(savedSession))
        } catch (e) {
          console.error(e)
        }
      }
    }

    const onAuthLogout = (e) => {
      const detail = e.detail || {}
      tokenStore.clear()
      localStorage.removeItem('scary_current_user')
      setCurrentUser({
        role: 'Guest',
        name: 'Guest User',
        username: '',
        email: '',
        avatar: '👤'
      })
      if (detail.code === 'ACCOUNT_BANNED') {
        showToast(`⛔ บัญชีถูกระงับ (ACCOUNT_BANNED): ${detail.message || ''}`)
      } else {
        showToast(`🔒 ออกจากระบบเรียบร้อย (เซสชันหมดอายุ)`)
      }
    }

    window.addEventListener('auth:logout', onAuthLogout)
    return () => window.removeEventListener('auth:logout', onAuthLogout)
  }, [])

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
  const handleLogout = async () => {
    if (currentUser.authProvider === 'api') {
      await api.logout()
    } else {
      tokenStore.clear()
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
    tokenStore.clear()
    if (currentTab === 'admin' || currentTab === 'watchlist' || currentTab === 'users' || currentTab === 'api') {
      setCurrentTab('home')
    }
    showToast('👋 ออกจากระบบเรียบร้อยแล้ว (กลับสู่สถานะ Guest)')
  }

  // ========================================================
  // 1. สมัครสมาชิก (Sign Up): รองรับ Cloud API และ Local users.json
  // ========================================================
  const handleRegisterSubmit = async (e) => {
    e.preventDefault()
    setAuthError('')
    setFieldErrorsObj({})

    if (!regForm.name || !regForm.email || !regForm.password) {
      setAuthError('กรุณากรอกข้อมูลสำคัญให้ครบถ้วน')
      return
    }
    if (regForm.password !== regForm.confirmPassword) {
      setAuthError('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน')
      setFieldErrorsObj({ confirmPassword: 'รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน' })
      return
    }
    if (!regForm.acceptTerms) {
      setAuthError('กรุณายอมรับเงื่อนไขและนโยบายความเป็นส่วนตัว')
      return
    }

    setSubmittingAuth(true)

    // A) กรณีสมัครผ่าน Cloud Course API
    if (authProvider === 'api') {
      try {
        const { user: apiUser } = await api.register({
          name: regForm.name.trim(),
          email: regForm.email.trim(),
          password: regForm.password
        })
        const userData = {
          id: apiUser.id,
          role: apiUser.role === 'ADMIN' ? 'Admin' : (apiUser.role === 'EDITOR' ? 'Editor' : 'Member'),
          apiRole: apiUser.role,
          name: apiUser.name,
          username: apiUser.email.split('@')[0],
          email: apiUser.email,
          avatar: apiUser.avatarUrl || '🩸',
          authProvider: 'api',
          status: apiUser.status,
          isProtected: apiUser.isProtected
        }
        setCurrentUser(userData)
        localStorage.setItem('scary_current_user', JSON.stringify(userData))
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
        showToast(`🎉 สมัครสมาชิกผ่าน Cloud Course API สำเร็จ! ยินดีต้อนรับคุณ ${apiUser.name}`)
        return
      } catch (err) {
        const errs = fieldErrors(err)
        setFieldErrorsObj(errs)
        const errorMsg = err.response?.data?.error?.message || err.message || 'เกิดข้อผิดพลาดในการสมัครสมาชิกผ่าน Cloud API'
        setAuthError(errorMsg)
        return
      } finally {
        setSubmittingAuth(false)
      }
    }

    // B) กรณี Local users.json
    const payload = {
      name: regForm.name.trim(),
      username: regForm.username?.trim() || regForm.email.split('@')[0],
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
    } finally {
      setSubmittingAuth(false)
    }
  }

  // ========================================================
  // 2. เข้าสู่ระบบ (Login): รองรับ Cloud API และ Local Mock
  // ========================================================
  const handleLoginSubmit = async (e) => {
    e.preventDefault()
    setAuthError('')
    setFieldErrorsObj({})

    const input = loginForm.emailOrUser.trim()
    const pass = loginForm.password

    if (!input || !pass) {
      setAuthError('กรุณากรอกอีเมลและรหัสผ่าน')
      return
    }

    setSubmittingAuth(true)

    // A) กรณีเข้าสู่ระบบผ่าน Cloud Course API (dev2life Workers)
    if (authProvider === 'api') {
      try {
        const { user: apiUser } = await api.login(input, pass)
        const userData = {
          id: apiUser.id,
          role: apiUser.role === 'ADMIN' ? 'Admin' : (apiUser.role === 'EDITOR' ? 'Editor' : 'Member'),
          apiRole: apiUser.role,
          name: apiUser.name,
          username: apiUser.email.split('@')[0],
          email: apiUser.email,
          avatar: apiUser.avatarUrl || (apiUser.role === 'ADMIN' ? '👑' : apiUser.role === 'EDITOR' ? '✍️' : '🩸'),
          authProvider: 'api',
          status: apiUser.status,
          isProtected: apiUser.isProtected
        }
        setCurrentUser(userData)
        if (loginForm.rememberMe) {
          localStorage.setItem('scary_current_user', JSON.stringify(userData))
        }
        setShowAuthModal(false)
        setGuestWarningModal({ show: false, title: '', message: '' })
        showToast(`☁️ เข้าสู่ระบบ Cloud Course API สำเร็จ! สวัสดีคุณ ${apiUser.name} (${apiUser.role})`)
        return
      } catch (err) {
        const errs = fieldErrors(err)
        setFieldErrorsObj(errs)
        const code = err.response?.data?.error?.code
        const errorMsg = err.response?.data?.error?.message || err.message || 'เข้าสู่ระบบผ่าน Cloud API ไม่สำเร็จ'
        if (code === 'ACCOUNT_BANNED') {
          setAuthError(`⛔ บัญชีนี้ถูกระงับการใช้งาน (ACCOUNT_BANNED): ${errorMsg}`)
        } else {
          setAuthError(errorMsg)
        }
        return
      } finally {
        setSubmittingAuth(false)
      }
    }

    // B) กรณีตรวจสอบผ่าน users.json (Local Mock)
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
      setAuthError('อีเมล/ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง (ลองตรวจสอบข้อมูลใน users.json)')
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
            </>
          )}

          {/* Cloud API & System Health Tab */}
          <button
            type="button"
            className={`nav-tab-btn api-tab ${currentTab === 'api' ? 'active' : ''}`}
            onClick={() => setCurrentTab('api')}
            title="คลิกเพื่อตรวจสอบ Health Check และทดสอบระบบ Cloud API"
          >
            📡 Cloud API {apiStatus === 'online' ? '🟢' : apiStatus === 'offline' ? '🔴' : '🟡'}
          </button>
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
              แสดงข้อมูลบัญชีผู้ใช้งาน (เชื่อมต่อผ่าน public/users.json และ Cloud Course API)
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
            <h4>💡 ข้อมูล Requirement เชื่อม Cloud Course API (dev2life Workers):</h4>
            <p>1. <strong>ตรวจสอบสถานะระบบ (Health Check):</strong> เรียก <code>GET /api/v1/system/health</code> ตรวจเช็กสถานะแบบ Real-time</p>
            <p>2. <strong>สมัครสมาชิก (Sign Up):</strong> ส่งข้อมูล <code>POST /api/v1/auth/register</code> บันทึกลง Cloud Database</p>
            <p>3. <strong>เข้าสู่ระบบ (Login):</strong> ตรวจสอบสิทธิ์ผ่าน <code>POST /api/v1/auth/login</code> พร้อมเก็บ JWT Tokens</p>
            <p>4. <strong>แสดงข้อมูลสมาชิก (Member Area):</strong> แสดงชื่อ, Email และ Role จาก <code>GET /api/v1/auth/me</code></p>
            <p>5. <strong>Route Guard & Permissions:</strong> ทดสอบสิทธิ์การเข้าถึงผ่าน <code>/api/v1/demo/*</code> (Public, User, Editor, Admin)</p>
            <p>6. <strong>ออกจากระบบ (Logout):</strong> เรียกใช้ <code>POST /api/v1/auth/logout</code> และเคลียร์ Session กลับสู่ Guest</p>
          </div>
        </div>
      )}

      {/* ================= TAB 5: CLOUD API & HEALTH SYSTEM ================= */}
      {currentTab === 'api' && (
        <div className="api-section">
          {/* Header Card */}
          <div className="api-header-card">
            <div className="api-header-info">
              <span className="api-badge-glow">🌐 React Course Cloud API (dev2life Workers)</span>
              <h2>ระบบเชื่อมต่อ Backend API</h2>
              <p className="api-desc">
                API Base URL: <code>{API_BASE_URL}</code>
              </p>
            </div>
            <div className="api-status-widget">
              <div className={`status-pill ${apiStatus}`}>
                <span className="status-indicator"></span>
                <span>สถานะ: {apiStatus === 'online' ? 'Online พร้อมใช้งาน' : apiStatus === 'offline' ? 'Offline ไม่สามารถเชื่อมต่อได้' : 'กำลังตรวจสอบ...'}</span>
              </div>
              {apiLatency && <span className="latency-pill">⚡ Latency: {apiLatency} ms</span>}
              <button type="button" className="btn-refresh-health" onClick={fetchApiHealth}>
                🔄 เช็กสถานะใหม่
              </button>
            </div>
          </div>

          {/* Section 1: Health Check (ตรงตามโจทย์ในภาพ) */}
          <div className="api-card">
            <div className="api-card-header">
              <div className="card-title-group">
                <h3>1. ทดสอบเรียก Health Check API</h3>
                <span className="endpoint-tag">GET /api/v1/system/health</span>
              </div>
              <span className="api-helper-tag">
                คำสั่ง: <code>fetch(`${import.meta.env.VITE_API_URL}/system/health`)</code>
              </span>
            </div>
            <div className="api-card-body">
              <pre className="code-output-box">
                {apiHealth ? JSON.stringify(apiHealth, null, 2) : '// กำลังเรียก API หรือไม่พบข้อมูล...'}
              </pre>
            </div>
          </div>

          {/* Section 2: Route Guard / Permissions Demo */}
          <div className="api-card">
            <div className="api-card-header">
              <div className="card-title-group">
                <h3>2. ทดสอบ Route Guard & สิทธิ์การเข้าถึง (Demo Permissions)</h3>
                <span className="endpoint-tag">GET /api/v1/demo/:level</span>
              </div>
              <span className="user-current-pill">
                ผู้ใช้ปัจจุบัน: {currentUser.role} ({currentUser.name}) [{currentUser.authProvider === 'api' ? 'Cloud API' : currentUser.authProvider || 'Local'}]
              </span>
            </div>
            <div className="api-card-body">
              <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1rem' }}>
                ทดสอบยิง API ตามระดับสิทธิ์ (ระบบแนบ Bearer Token ให้อัตโนมัติใน Header):
              </p>
              <div className="demo-route-buttons">
                <button
                  type="button"
                  className="btn-demo-route public"
                  onClick={() => handleTestDemoRoute('public')}
                  disabled={demoTestLoading}
                >
                  🔓 Public (ทุกคนเข้าได้)
                </button>
                <button
                  type="button"
                  className="btn-demo-route user"
                  onClick={() => handleTestDemoRoute('user')}
                  disabled={demoTestLoading}
                >
                  👤 User (ต้องเข้าสู่ระบบ)
                </button>
                <button
                  type="button"
                  className="btn-demo-route editor"
                  onClick={() => handleTestDemoRoute('editor')}
                  disabled={demoTestLoading}
                >
                  ✍️ Editor (EDITOR หรือ ADMIN)
                </button>
                <button
                  type="button"
                  className="btn-demo-route admin"
                  onClick={() => handleTestDemoRoute('admin')}
                  disabled={demoTestLoading}
                >
                  👑 Admin (ADMIN เท่านั้น)
                </button>
              </div>

              {demoTestResult && (
                <div className={`demo-result-box ${demoTestResult.success ? 'success' : 'failed'}`}>
                  <div className="demo-result-header">
                    <span>
                      ผลลัพธ์ /{demoTestResult.level}: {demoTestResult.success ? '✅ ผ่านสิทธิ์ (Authorized)' : '❌ สิทธิ์ไม่เพียงพอหรือยังไม่เข้าสู่ระบบ'}
                    </span>
                  </div>
                  <pre className="code-output-box small">
                    {JSON.stringify(demoTestResult.success ? demoTestResult.data : { error: demoTestResult.error }, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Dev Teaching Helper - ทดสอบ Auto-Refresh เมื่อ Token หมดอายุ (Lv3) */}
          <div className="api-card">
            <div className="api-card-header">
              <div className="card-title-group">
                <h3>3. ทดสอบ Auto-Refresh เมื่อ Token หมดอายุ (Axios Interceptor)</h3>
                <span className="endpoint-tag">POST /api/v1/auth/dev/expired-token</span>
              </div>
              <button
                type="button"
                className="btn-test-expired"
                onClick={handleTestExpiredToken}
                disabled={testingExpiredToken || !tokenStore.access}
                title={!tokenStore.access ? 'ต้องเข้าสู่ระบบผ่าน Cloud API ก่อนจึงจะทดสอบได้' : 'คลิกเพื่อทดสอบจำลอง Token หมดอายุและ Auto-Refresh'}
              >
                {testingExpiredToken ? '⏳ กำลังทดสอบ...' : '⏰ จำลอง Token หมดอายุ & ทดสอบ Auto-Refresh'}
              </button>
            </div>
            <div className="api-card-body">
              <p style={{ color: '#94a3b8', fontSize: '0.88rem', lineHeight: '1.6' }}>
                💡 <strong>กลไกการทำงานตามมาตรฐานหลักสูตร:</strong> เมื่อกดปุ่ม ระบบจะขอ <code>accessToken</code> ที่หมดอายุแล้ว 1 นาที จากนั้นส่งคำขอไปยัง <code>GET /auth/me</code>
                Axios Interceptor จะดักจับ HTTP <code>401 TOKEN_EXPIRED</code> อัตโนมัติ แล้วนำ <code>refreshToken</code> ไปขอคู่ Token ใหม่ที่ <code>/auth/refresh</code> และ Retry Request เดิมทันทีโดยที่ผู้ใช้ไม่ต้อง Login ใหม่
              </p>
              {!tokenStore.access && (
                <p style={{ color: '#fbbf24', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                  ⚠️ กรุณาเข้าสู่ระบบผ่าน Cloud API (เช่น บัญชี <code>admin@demo.com</code> หรือ <code>user@demo.com</code>) ก่อนกดทดสอบ
                </p>
              )}
            </div>
          </div>

          {/* Section 4: Cloud API Users (ถ้า Role ปัจจุบันเป็น Admin) */}
          {(currentUser.role === 'Admin' || currentUser.apiRole === 'ADMIN') && (
            <div className="api-card">
              <div className="api-card-header">
                <div className="card-title-group">
                  <h3>4. บัญชีผู้ใช้บน Cloud API (Admin Only)</h3>
                  <span className="endpoint-tag">GET /api/v1/admin/users</span>
                </div>
                <button
                  type="button"
                  className="btn-fetch-cloud-users"
                  onClick={() => fetchCloudUsers(1)}
                  disabled={loadingCloudUsers}
                >
                  {loadingCloudUsers ? '⏳ กำลังโหลด...' : '📥 โหลดข้อมูลใหม่'}
                </button>
              </div>

              <div className="api-card-body">
                {/* User Stats Summary Cards */}
                {adminStats && (
                  <div className="admin-stats-grid">
                    <div className="admin-stat-card">
                      <div className="stat-title">ผู้ใช้ทั้งหมด</div>
                      <div className="stat-value">{adminStats.total}</div>
                    </div>
                    <div className="admin-stat-card">
                      <div className="stat-title">USER</div>
                      <div className="stat-value" style={{ color: '#a78bfa' }}>{adminStats.byRole?.USER ?? 0}</div>
                    </div>
                    <div className="admin-stat-card">
                      <div className="stat-title">EDITOR</div>
                      <div className="stat-value" style={{ color: '#38bdf8' }}>{adminStats.byRole?.EDITOR ?? 0}</div>
                    </div>
                    <div className="admin-stat-card">
                      <div className="stat-title">ADMIN</div>
                      <div className="stat-value" style={{ color: '#fbbf24' }}>{adminStats.byRole?.ADMIN ?? 0}</div>
                    </div>
                    <div className="admin-stat-card">
                      <div className="stat-title">ACTIVE</div>
                      <div className="stat-value" style={{ color: '#4ade80' }}>{adminStats.byStatus?.ACTIVE ?? 0}</div>
                    </div>
                    <div className="admin-stat-card">
                      <div className="stat-title">BANNED</div>
                      <div className="stat-value" style={{ color: '#f87171' }}>{adminStats.byStatus?.BANNED ?? 0}</div>
                    </div>
                  </div>
                )}

                {/* Filter and Search Bar */}
                <div className="admin-filter-bar">
                  <input
                    type="text"
                    placeholder="🔍 ค้นหาชื่อ หรือ อีเมล..."
                    value={adminSearch}
                    onChange={(e) => setAdminSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') fetchCloudUsers(1); }}
                    className="admin-search-input"
                  />
                  <select
                    className="admin-select"
                    value={adminRoleFilter}
                    onChange={(e) => { setAdminRoleFilter(e.target.value); }}
                  >
                    <option value="">ทุก Role</option>
                    <option value="USER">USER</option>
                    <option value="EDITOR">EDITOR</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                  <select
                    className="admin-select"
                    value={adminStatusFilter}
                    onChange={(e) => { setAdminStatusFilter(e.target.value); }}
                  >
                    <option value="">ทุกสถานะ</option>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="BANNED">BANNED</option>
                  </select>
                  <select
                    className="admin-select"
                    value={adminSort}
                    onChange={(e) => { setAdminSort(e.target.value); }}
                  >
                    <option value="createdAt">เรียงตาม วันที่สมัคร</option>
                    <option value="name">เรียงตาม ชื่อ</option>
                    <option value="email">เรียงตาม อีเมล</option>
                  </select>
                  <select
                    className="admin-select"
                    value={adminOrder}
                    onChange={(e) => { setAdminOrder(e.target.value); }}
                  >
                    <option value="desc">มาก ➔ น้อย</option>
                    <option value="asc">น้อย ➔ มาก</option>
                  </select>
                  <button
                    type="button"
                    className="btn-fetch-cloud-users"
                    onClick={() => fetchCloudUsers(1)}
                  >
                    🔎 กรอง
                  </button>
                </div>

                {cloudUsers.length > 0 ? (
                  <>
                    <div className="cloud-users-table-wrap">
                      <table className="users-table">
                        <thead>
                          <tr>
                            <th>ชื่อ</th>
                            <th>อีเมล</th>
                            <th>Role</th>
                            <th>สถานะ</th>
                            <th>การจัดการ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cloudUsers.map(u => {
                            const isSelf = u.id === currentUser.id
                            const isProtectedAccount = u.isProtected || u.role === 'ADMIN' || isSelf
                            return (
                              <tr key={u.id}>
                                <td>
                                  <strong>{u.name}</strong>
                                  {u.isProtected && <span className="tag-protected" title="บัญชีตัวอย่าง ไม่สามารถแก้ไขได้">🔒 Protected</span>}
                                  {isSelf && <span className="tag-protected" style={{ background: 'rgba(56,189,248,0.2)', color: '#38bdf8', borderColor: '#38bdf8' }}>คุณ</span>}
                                </td>
                                <td><code>{u.email}</code></td>
                                <td>
                                  {isProtectedAccount ? (
                                    <span className={`role-badge role-${u.role.toLowerCase()}`}>{u.role}</span>
                                  ) : (
                                    <select
                                      className="admin-select"
                                      value={u.role}
                                      onChange={(e) => handleUpdateRole(u.id, e.target.value)}
                                      style={{ padding: '0.2rem 0.4rem', fontSize: '0.78rem' }}
                                    >
                                      <option value="USER">USER</option>
                                      <option value="EDITOR">EDITOR</option>
                                    </select>
                                  )}
                                </td>
                                <td>
                                  <span className={`status-badge ${u.status.toLowerCase()}`}>{u.status}</span>
                                </td>
                                <td>
                                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                                    <button
                                      type="button"
                                      className={`admin-action-btn ${u.status === 'ACTIVE' ? 'ban' : 'unban'}`}
                                      disabled={isProtectedAccount}
                                      onClick={() => handleUpdateStatus(u.id, u.status === 'ACTIVE' ? 'BANNED' : 'ACTIVE')}
                                      title={isProtectedAccount ? 'ไม่สามารถแก้ไขบัญชี Protected/Admin/ตัวเอง' : ''}
                                    >
                                      {u.status === 'ACTIVE' ? '⛔ แบน' : '✅ ปลดแบน'}
                                    </button>
                                    <button
                                      type="button"
                                      className="admin-action-btn ban"
                                      disabled={isProtectedAccount}
                                      onClick={() => handleDeleteCloudUser(u.id, u.name)}
                                      title={isProtectedAccount ? 'ไม่สามารถลบบัญชี Protected/Admin/ตัวเอง' : 'ลบบัญชี'}
                                    >
                                      🗑️
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    <div className="admin-pagination">
                      <span>หน้า {adminMeta.page} จากทั้งหมด {adminMeta.totalPages} หน้า (รวม {adminMeta.total} บัญชี)</span>
                      <div className="pagination-buttons">
                        <button
                          type="button"
                          className="pagination-btn"
                          disabled={adminPage <= 1 || loadingCloudUsers}
                          onClick={() => fetchCloudUsers(adminPage - 1)}
                        >
                          ◀ ก่อนหน้า
                        </button>
                        <button
                          type="button"
                          className="pagination-btn"
                          disabled={adminPage >= adminMeta.totalPages || loadingCloudUsers}
                          onClick={() => fetchCloudUsers(adminPage + 1)}
                        >
                          ถัดไป ▶
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <p style={{ color: '#94a3b8', textAlign: 'center', padding: '1.5rem', fontSize: '0.9rem' }}>
                    กดปุ่ม <strong>"โหลดข้อมูลใหม่"</strong> เพื่อดึงรายชื่อผู้ใช้จาก Cloud API
                  </p>
                )}
              </div>
            </div>
          )}
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
              {/* Provider Selection */}
              <div className="auth-provider-selector">
                <button
                  type="button"
                  className={`provider-btn ${authProvider === 'api' ? 'active' : ''}`}
                  onClick={() => { setAuthProvider('api'); setAuthError(''); }}
                >
                  ☁️ Cloud API (dev2life)
                </button>
                <button
                  type="button"
                  className={`provider-btn ${authProvider === 'local' ? 'active' : ''}`}
                  onClick={() => { setAuthProvider('local'); setAuthError(''); }}
                >
                  📄 Local Mock (users.json)
                </button>
              </div>

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
                      placeholder={authProvider === 'api' ? 'user@demo.com หรือ admin@demo.com' : 'member_alex หรือ admin_vlad'}
                      value={loginForm.emailOrUser}
                      onChange={(e) => {
                        setLoginForm({ ...loginForm, emailOrUser: e.target.value })
                        setFieldErrorsObj({ ...fieldErrorsObj, email: '' })
                      }}
                      className={`auth-input ${fieldErrorsObj.email ? 'has-error' : ''}`}
                      required
                    />
                    {fieldErrorsObj.email && <span className="field-error-text">❌ {fieldErrorsObj.email}</span>}
                  </div>

                  <div className="form-group">
                    <label>รหัสผ่าน</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={loginForm.password}
                      onChange={(e) => {
                        setLoginForm({ ...loginForm, password: e.target.value })
                        setFieldErrorsObj({ ...fieldErrorsObj, password: '' })
                      }}
                      className={`auth-input ${fieldErrorsObj.password ? 'has-error' : ''}`}
                      required
                    />
                    {fieldErrorsObj.password && <span className="field-error-text">❌ {fieldErrorsObj.password}</span>}
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

                  <button type="submit" className="btn-auth-submit" disabled={submittingAuth}>
                    {submittingAuth ? 'กำลังเข้าสู่ระบบ...' : `เข้าสู่ระบบ ${authProvider === 'api' ? '(Cloud Course API)' : '(Local users.json)'} 🩸`}
                  </button>

                  <div className="demo-accounts-hint">
                    {authProvider === 'api' ? (
                      <>
                        <span>💡 บัญชีทดสอบ Cloud Course API (dev2life Workers):</span>
                        <div className="demo-pill-wrap">
                          <button
                            type="button"
                            className="demo-pill cloud-pill"
                            onClick={() => {
                              setAuthError('')
                              setFieldErrorsObj({})
                              setLoginForm({ emailOrUser: 'user@demo.com', password: 'Password123', rememberMe: true })
                            }}
                          >
                            Member: <code>user@demo.com</code>
                          </button>
                          <button
                            type="button"
                            className="demo-pill cloud-pill"
                            onClick={() => {
                              setAuthError('')
                              setFieldErrorsObj({})
                              setLoginForm({ emailOrUser: 'editor@demo.com', password: 'Password123', rememberMe: true })
                            }}
                          >
                            Editor: <code>editor@demo.com</code>
                          </button>
                          <button
                            type="button"
                            className="demo-pill cloud-pill admin"
                            onClick={() => {
                              setAuthError('')
                              setFieldErrorsObj({})
                              setLoginForm({ emailOrUser: 'admin@demo.com', password: 'Password123', rememberMe: true })
                            }}
                          >
                            Admin: <code>admin@demo.com</code>
                          </button>
                          <button
                            type="button"
                            className="demo-pill cloud-pill"
                            style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: '#f87171', background: 'rgba(239, 68, 68, 0.1)' }}
                            onClick={() => {
                              setAuthError('')
                              setFieldErrorsObj({})
                              setLoginForm({ emailOrUser: 'banned@demo.com', password: 'Password123', rememberMe: false })
                            }}
                            title="ทดสอบกรณีบัญชีถูกระงับ 403 ACCOUNT_BANNED"
                          >
                            ⛔ Banned: <code>banned@demo.com</code> (ทดสอบ)
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span>💡 บัญชีทดสอบที่มีใน users.json:</span>
                        <div className="demo-pill-wrap">
                          <button
                            type="button"
                            className="demo-pill"
                            onClick={() => {
                              setAuthError('')
                              setFieldErrorsObj({})
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
                              setFieldErrorsObj({})
                              setLoginForm({ emailOrUser: 'admin@scaryseries.com', password: 'admin123', rememberMe: true })
                            }}
                          >
                            Admin: <code>admin@scaryseries.com</code> / <code>admin123</code>
                          </button>
                        </div>
                      </>
                    )}
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
                        onChange={(e) => {
                          setRegForm({ ...regForm, name: e.target.value })
                          setFieldErrorsObj({ ...fieldErrorsObj, name: '' })
                        }}
                        className={`auth-input ${fieldErrorsObj.name ? 'has-error' : ''}`}
                        required
                      />
                      {fieldErrorsObj.name && <span className="field-error-text">❌ {fieldErrorsObj.name}</span>}
                    </div>
                    <div className="form-group">
                      <label>ชื่อผู้ใช้ (Username) *</label>
                      <input
                        type="text"
                        placeholder="somchai_ghost"
                        value={regForm.username}
                        onChange={(e) => {
                          setRegForm({ ...regForm, username: e.target.value })
                          setFieldErrorsObj({ ...fieldErrorsObj, username: '' })
                        }}
                        className={`auth-input ${fieldErrorsObj.username ? 'has-error' : ''}`}
                        required
                      />
                      {fieldErrorsObj.username && <span className="field-error-text">❌ {fieldErrorsObj.username}</span>}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>อีเมล (Email) *</label>
                    <input
                      type="email"
                      placeholder="somchai@gmail.com"
                      value={regForm.email}
                      onChange={(e) => {
                        setRegForm({ ...regForm, email: e.target.value })
                        setFieldErrorsObj({ ...fieldErrorsObj, email: '' })
                      }}
                      className={`auth-input ${fieldErrorsObj.email ? 'has-error' : ''}`}
                      required
                    />
                    {fieldErrorsObj.email && <span className="field-error-text">❌ {fieldErrorsObj.email}</span>}
                  </div>

                  <div className="form-group-2col">
                    <div className="form-group">
                      <label>รหัสผ่าน (8–72 ตัวอักษร มีทั้งอังกฤษและตัวเลข) *</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={regForm.password}
                        onChange={(e) => {
                          setRegForm({ ...regForm, password: e.target.value })
                          setFieldErrorsObj({ ...fieldErrorsObj, password: '' })
                        }}
                        className={`auth-input ${fieldErrorsObj.password ? 'has-error' : ''}`}
                        required
                      />
                      {fieldErrorsObj.password && <span className="field-error-text">❌ {fieldErrorsObj.password}</span>}
                    </div>
                    <div className="form-group">
                      <label>ยืนยันรหัสผ่าน *</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={regForm.confirmPassword}
                        onChange={(e) => {
                          setRegForm({ ...regForm, confirmPassword: e.target.value })
                          setFieldErrorsObj({ ...fieldErrorsObj, confirmPassword: '' })
                        }}
                        className={`auth-input ${fieldErrorsObj.confirmPassword ? 'has-error' : ''}`}
                        required
                      />
                      {fieldErrorsObj.confirmPassword && <span className="field-error-text">❌ {fieldErrorsObj.confirmPassword}</span>}
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

                  <button type="submit" className="btn-auth-submit" disabled={submittingAuth}>
                    {submittingAuth ? 'กำลังส่งข้อมูลสมัครสมาชิก...' : `ยืนยันการสมัครสมาชิก ${authProvider === 'api' ? '(Cloud Course API)' : '(Local users.json)'} 🩸`}
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
