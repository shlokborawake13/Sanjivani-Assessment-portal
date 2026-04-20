import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { authenticate } from '../middleware/auth.js'
import { roleGuard } from '../middleware/roleGuard.js'
import multer from 'multer'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

// All assessment routes require authentication
router.use(authenticate)

// ─── CSV Parser ─────────────────────────────────────────
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) return []

  const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
  const rows = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length === 0) continue
    const row = {}
    headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim() })
    rows.push(row)
  }
  return rows
}

function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else { inQuotes = !inQuotes }
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

// ─── Assessment CRUD ────────────────────────────────────

// GET /api/assessments — List all assessments
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('assessments')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) return res.status(400).json({ error: error.message })

    // Attach question count to each assessment
    const ids = data.map(a => a.id)
    const { data: counts } = await supabaseAdmin
      .from('questions')
      .select('assessment_id')
      .in('assessment_id', ids)

    const countMap = {}
    ;(counts || []).forEach(q => {
      countMap[q.assessment_id] = (countMap[q.assessment_id] || 0) + 1
    })

    const assessments = data.map(a => ({
      ...a,
      question_count: countMap[a.id] || 0
    }))

    res.json({ assessments })
  } catch (err) {
    console.error('List assessments error:', err)
    res.status(500).json({ error: 'Failed to fetch assessments' })
  }
})

// GET /api/assessments/:id — Get single assessment
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('assessments')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle()

    if (error) return res.status(400).json({ error: error.message })
    if (!data) return res.status(404).json({ error: 'Assessment not found' })

    // Attach question count
    const { count } = await supabaseAdmin
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('assessment_id', req.params.id)

    res.json({ assessment: { ...data, question_count: count || 0 } })
  } catch (err) {
    console.error('Get assessment error:', err)
    res.status(500).json({ error: 'Failed to fetch assessment' })
  }
})

// POST /api/assessments — Create assessment (admin/manager only)
router.post('/', roleGuard('admin', 'manager'), async (req, res) => {
  try {
    const { title, description, category, duration, questions, difficulty, status, expires_at, level, type } = req.body

    if (!title || !category) {
      return res.status(400).json({ error: 'Title and category are required' })
    }

    const { data, error } = await supabaseAdmin
      .from('assessments')
      .insert({
        title,
        description: description || '',
        category,
        duration: duration || '60 min',
        questions: parseInt(questions) || 0,
        difficulty: difficulty || 'Intermediate',
        status: status || 'available',
        created_by: req.user.id,
        expires_at: expires_at || null,
        level: level || 'Beginner, Intermediate, Advanced',
        type: type || 'Practice'
      })
      .select()
      .maybeSingle()

    if (error) return res.status(400).json({ error: error.message })
    if (!data) return res.status(500).json({ error: 'Failed to create assessment' })
    res.status(201).json({ assessment: data })
  } catch (err) {
    console.error('Create assessment error:', err)
    res.status(500).json({ error: 'Failed to create assessment' })
  }
})

// PUT /api/assessments/:id — Update assessment (admin/manager only)
router.put('/:id', roleGuard('admin', 'manager'), async (req, res) => {
  try {
    const { title, description, category, duration, questions, difficulty, status, expires_at, level, type } = req.body
    const updates = {}
    if (title !== undefined) updates.title = title
    if (description !== undefined) updates.description = description
    if (category !== undefined) updates.category = category
    if (duration !== undefined) updates.duration = duration
    if (questions !== undefined) updates.questions = parseInt(questions) || 0
    if (difficulty !== undefined) updates.difficulty = difficulty
    if (status !== undefined) updates.status = status
    if (expires_at !== undefined) updates.expires_at = expires_at || null
    if (level !== undefined) updates.level = level
    if (type !== undefined) updates.type = type

    const { data, error } = await supabaseAdmin
      .from('assessments')
      .update(updates)
      .eq('id', req.params.id)
      .select()

    if (error) return res.status(400).json({ error: error.message })
    if (!data || data.length === 0) return res.status(404).json({ error: 'Assessment not found' })
    res.json({ assessment: data[0] })
  } catch (err) {
    console.error('Update assessment error:', err)
    res.status(500).json({ error: 'Failed to update assessment' })
  }
})

// DELETE /api/assessments/:id — Delete assessment (admin/manager)
router.delete('/:id', roleGuard('admin', 'manager'), async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('assessments')
      .delete()
      .eq('id', req.params.id)

    if (error) return res.status(400).json({ error: error.message })
    res.json({ message: 'Assessment deleted successfully' })
  } catch (err) {
    console.error('Delete assessment error:', err)
    res.status(500).json({ error: 'Failed to delete assessment' })
  }
})

// ─── Questions Management ───────────────────────────────

// POST /api/assessments/:id/upload-csv — Upload CSV of questions
router.post('/:id/upload-csv', roleGuard('admin', 'manager'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'CSV file is required' })

    // Verify assessment exists
    const { data: assessment } = await supabaseAdmin
      .from('assessments')
      .select('id')
      .eq('id', req.params.id)
      .maybeSingle()

    if (!assessment) return res.status(404).json({ error: 'Assessment not found' })

    const csvText = req.file.buffer.toString('utf-8')
    const rows = parseCSV(csvText)

    if (rows.length === 0) {
      return res.status(400).json({ error: 'CSV file is empty or has invalid format' })
    }

    // Map CSV rows to question records
    const questions = rows.map((row, idx) => ({
      assessment_id: req.params.id,
      question_text: row.question_text || row.question || '',
      option_a: row.option_a || row.a || '',
      option_b: row.option_b || row.b || '',
      option_c: row.option_c || row.c || '',
      option_d: row.option_d || row.d || '',
      correct_answer: (row.correct_answer || row.answer || 'A').toUpperCase(),
      question_type: row.question_type || row.type || 'mcq',
      difficulty: row.difficulty || 'Intermediate',
      explanation: row.explanation || '',
      sort_order: idx
    })).filter(q => q.question_text.length > 0)

    if (questions.length === 0) {
      return res.status(400).json({ error: 'No valid questions found in CSV. Required column: question_text' })
    }

    // Insert questions
    const { data, error } = await supabaseAdmin
      .from('questions')
      .insert(questions)
      .select()

    if (error) return res.status(400).json({ error: error.message })

    // Update question count on assessment
    await supabaseAdmin
      .from('assessments')
      .update({ questions: questions.length })
      .eq('id', req.params.id)

    res.status(201).json({
      message: `${questions.length} questions uploaded successfully`,
      count: questions.length,
      questions: data
    })
  } catch (err) {
    console.error('CSV upload error:', err)
    res.status(500).json({ error: 'Failed to upload CSV' })
  }
})

// GET /api/assessments/:id/questions — Get questions for an assessment
router.get('/:id/questions', async (req, res) => {
  try {
    const role = req.user.profile.role
    const isStudent = role === 'student'

    let selectFields = '*'
    if (isStudent) {
      // Hide correct answers and explanations from students
      selectFields = 'id, assessment_id, question_text, option_a, option_b, option_c, option_d, question_type, difficulty, code_template, test_cases, sort_order'
    }

    const { data, error } = await supabaseAdmin
      .from('questions')
      .select(selectFields)
      .eq('assessment_id', req.params.id)
      .order('sort_order')

    if (error) return res.status(400).json({ error: error.message })
    res.json({ questions: data })
  } catch (err) {
    console.error('Get questions error:', err)
    res.status(500).json({ error: 'Failed to fetch questions' })
  }
})

// DELETE /api/assessments/:id/questions — Delete all questions for an assessment
router.delete('/:id/questions', roleGuard('admin', 'manager'), async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('questions')
      .delete()
      .eq('assessment_id', req.params.id)

    if (error) return res.status(400).json({ error: error.message })

    // Reset question count
    await supabaseAdmin
      .from('assessments')
      .update({ questions: 0 })
      .eq('id', req.params.id)

    res.json({ message: 'All questions deleted' })
  } catch (err) {
    console.error('Delete questions error:', err)
    res.status(500).json({ error: 'Failed to delete questions' })
  }
})

export default router
