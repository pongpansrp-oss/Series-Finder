import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function backendApiPlugin() {
  return {
    name: 'backend-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // API: บันทึกข้อมูลภาพยนตร์ (Admin)
        if (req.url === '/api/save-movies' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              const moviesPath = path.resolve(__dirname, 'public/movies.json')
              const parsed = JSON.parse(body)
              fs.writeFileSync(moviesPath, JSON.stringify(parsed, null, 2), 'utf8')
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true, message: 'Saved to public/movies.json successfully!' }))
            } catch (err) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: false, error: err.message }))
            }
          })
          return
        }

        // API: สมัครสมาชิกใหม่ บันทึกลง public/users.json
        if (req.url === '/api/register' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              const usersPath = path.resolve(__dirname, 'public/users.json')
              let users = []
              if (fs.existsSync(usersPath)) {
                const fileContent = fs.readFileSync(usersPath, 'utf8')
                users = JSON.parse(fileContent || '[]')
              }

              const newUser = JSON.parse(body)

              // ตรวจสอบว่า Username หรือ Email ซ้ำหรือไม่
              const isUsernameExist = users.some(u => u.username.toLowerCase() === newUser.username.toLowerCase())
              const isEmailExist = users.some(u => u.email.toLowerCase() === newUser.email.toLowerCase())

              if (isUsernameExist) {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ success: false, message: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' }))
                return
              }

              if (isEmailExist) {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ success: false, message: 'อีเมลนี้ถูกใช้งานแล้ว' }))
                return
              }

              // กำหนด ID และข้อมูลเริ่มต้น
              newUser.id = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1
              newUser.role = newUser.role || 'Member'
              newUser.avatar = newUser.avatar || '🩸'
              newUser.createdAt = new Date().toISOString()

              users.push(newUser)

              // เขียนบันทึกลง public/users.json
              fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), 'utf8')

              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ 
                success: true, 
                message: 'สมัครสมาชิกและบันทึกลง public/users.json เรียบร้อยแล้ว!',
                user: newUser 
              }))
            } catch (err) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: false, error: err.message }))
            }
          })
          return
        }

        next()
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), backendApiPlugin()],
})
