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

// GET /api/assessments — List all assessments (filtered for students)
router.get('/', async (req, res) => {
  try {
    const role = req.user.profile.role
    const { data, error } = await supabaseAdmin
      .from('assessments')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) return res.status(400).json({ error: error.message })

    // Attach question count to each assessment
    const ids = data.map(a => a.id)
    let countMap = {}
    if (ids.length > 0) {
      const { data: counts } = await supabaseAdmin
        .from('questions')
        .select('assessment_id')
        .in('assessment_id', ids)
      ;(counts || []).forEach(q => {
        countMap[q.assessment_id] = (countMap[q.assessment_id] || 0) + 1
      })
    }

    let assessments = data.map(a => ({
      ...a,
      question_count: countMap[a.id] || 0
    }))

    // For students: filter by visibility rules
    if (role === 'student') {
      const profile = req.user.profile
      const now = new Date()

      // Get attempt counts for this student
      const { data: studentAttempts } = await supabaseAdmin
        .from('attempts')
        .select('assessment_id, status, invalidated')
        .eq('user_id', req.user.id)
        .eq('invalidated', false)

      const attemptCountMap = {}
      ;(studentAttempts || []).forEach(a => {
        if (!attemptCountMap[a.assessment_id]) attemptCountMap[a.assessment_id] = 0
        // Count submitted and auto_submitted attempts
        if (a.status !== 'in_progress') {
          attemptCountMap[a.assessment_id]++
        }
      })
      const inProgressMap = {}
      ;(studentAttempts || []).forEach(a => {
        if (a.status === 'in_progress') inProgressMap[a.assessment_id] = true
      })

      assessments = assessments.filter(a => {
        // Must be active
        if (a.is_active === false) return false
        if (a.status !== 'available' && a.is_active !== true) return false

        // Check scheduling window
        if (a.start_time && now < new Date(a.start_time)) return false
        if (a.end_time) {
          let deadline = new Date(a.end_time)
          if (a.allow_late_entry && a.late_entry_minutes > 0) {
            deadline = new Date(deadline.getTime() + a.late_entry_minutes * 60 * 1000)
          }
          if (now > deadline) return false
        }

        // Check target audience (unless open_to_all)
        if (!a.open_to_all) {
          const tDepts = a.target_departments || []
          const tYears = a.target_years || []
          const tSections = a.target_sections || []
          if (tDepts.length > 0 && !tDepts.includes(profile.department)) return false
          if (tYears.length > 0 && !tYears.includes(profile.year)) return false
          if (tSections.length > 0 && !tSections.includes(profile.section || profile.division)) return false
        }

        return true
      })

      // Attach attempt info
      assessments = assessments.map(a => ({
        ...a,
        attempts_used: attemptCountMap[a.assessment_id] || attemptCountMap[a.id] || 0,
        max_attempts: a.max_attempts || 1,
        has_in_progress: !!inProgressMap[a.id],
        can_attempt: (attemptCountMap[a.id] || 0) < (a.max_attempts || 1) || !!inProgressMap[a.id]
      }))
    }

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

// POST /api/assessments — Create assessment (admin only)
router.post('/', roleGuard('admin'), async (req, res) => {
  try {
    const {
      title, description, category, duration, questions, difficulty, status,
      expires_at, level, type,
      // Lifecycle fields
      duration_minutes, total_marks, passing_marks, max_attempts, instructions,
      exam_type, is_active, start_time, end_time, late_entry_minutes, allow_late_entry,
      shuffle_questions, shuffle_options, show_results_immediately,
      target_departments, target_years, target_sections, open_to_all,
      // Assessment type (4 types)
      assessment_type,
      // Proctoring configuration
      require_camera, require_mic, max_violations, violation_auto_submit,
      min_screen_width, min_screen_height, proctoring_strictness
    } = req.body

    if (!title) {
      return res.status(400).json({ error: 'Title is required' })
    }

    // Validate assessment_type
    const validTypes = ['aptitude', 'coding', 'communication', 'technical_reasoning']
    const aType = validTypes.includes(assessment_type) ? assessment_type : 'aptitude'

    const durationMins = parseInt(duration_minutes) || parseInt((duration || '60').match(/(\d+)/)?.[1]) || 60

    // Compute end_time from start_time + duration if not provided
    let computedEndTime = end_time || null
    if (start_time && !end_time) {
      computedEndTime = new Date(new Date(start_time).getTime() + durationMins * 60 * 1000).toISOString()
    }

    const { data, error } = await supabaseAdmin
      .from('assessments')
      .insert({
        title,
        description: description || '',
        category: category || 'General',
        duration: duration || `${durationMins} min`,
        duration_minutes: durationMins,
        questions: parseInt(questions) || 0,
        difficulty: difficulty || 'Intermediate',
        status: status || 'available',
        created_by: req.user.id,
        expires_at: expires_at || null,
        level: level || 'Beginner, Intermediate, Advanced',
        type: type || 'Practice',
        // Lifecycle
        total_marks: parseInt(total_marks) || 0,
        passing_marks: parseInt(passing_marks) || 0,
        max_attempts: parseInt(max_attempts) || 1,
        instructions: instructions || '',
        exam_type: exam_type || 'non_proctored',
        is_active: is_active !== false,
        start_time: start_time || null,
        end_time: computedEndTime,
        late_entry_minutes: parseInt(late_entry_minutes) || 0,
        allow_late_entry: !!allow_late_entry,
        shuffle_questions: shuffle_questions !== false,
        shuffle_options: shuffle_options !== false,
        show_results_immediately: show_results_immediately !== false,
        target_departments: target_departments || [],
        target_years: target_years || [],
        target_sections: target_sections || [],
        open_to_all: open_to_all !== false,
        // Assessment type
        assessment_type: aType,
        // Proctoring config
        require_camera: !!require_camera,
        require_mic: !!require_mic,
        max_violations: parseInt(max_violations) || 3,
        violation_auto_submit: violation_auto_submit !== false,
        min_screen_width: parseInt(min_screen_width) || 1024,
        min_screen_height: parseInt(min_screen_height) || 768,
        proctoring_strictness: ['relaxed', 'standard', 'strict'].includes(proctoring_strictness) ? proctoring_strictness : 'standard'
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

// PUT /api/assessments/:id — Update assessment (admin only)
router.put('/:id', roleGuard('admin'), async (req, res) => {
  try {
    const b = req.body
    const updates = {}

    // Basic fields
    const fields = [
      'title', 'description', 'category', 'duration', 'difficulty', 'status',
      'level', 'type', 'instructions', 'exam_type', 'proctoring_strictness'
    ]
    fields.forEach(f => { if (b[f] !== undefined) updates[f] = b[f] })

    // Assessment type validation
    if (b.assessment_type !== undefined) {
      const validTypes = ['aptitude', 'coding', 'communication', 'technical_reasoning']
      updates.assessment_type = validTypes.includes(b.assessment_type) ? b.assessment_type : 'aptitude'
    }

    // Integer fields
    const intFields = [
      'questions', 'duration_minutes', 'total_marks', 'passing_marks',
      'max_attempts', 'late_entry_minutes', 'max_violations',
      'min_screen_width', 'min_screen_height'
    ]
    intFields.forEach(f => { if (b[f] !== undefined) updates[f] = parseInt(b[f]) || 0 })

    // Boolean fields
    const boolFields = [
      'is_active', 'allow_late_entry', 'shuffle_questions',
      'shuffle_options', 'show_results_immediately', 'open_to_all',
      'require_camera', 'require_mic', 'violation_auto_submit'
    ]
    boolFields.forEach(f => { if (b[f] !== undefined) updates[f] = !!b[f] })

    // Date fields
    if (b.start_time !== undefined) updates.start_time = b.start_time || null
    if (b.end_time !== undefined) updates.end_time = b.end_time || null
    if (b.expires_at !== undefined) updates.expires_at = b.expires_at || null

    // Compute end_time from start_time + duration if start_time changed
    if (updates.start_time && !updates.end_time && updates.duration_minutes) {
      updates.end_time = new Date(new Date(updates.start_time).getTime() + updates.duration_minutes * 60 * 1000).toISOString()
    }

    // JSONB array fields
    if (b.target_departments !== undefined) updates.target_departments = b.target_departments || []
    if (b.target_years !== undefined) updates.target_years = b.target_years || []
    if (b.target_sections !== undefined) updates.target_sections = b.target_sections || []

    // Sync duration string
    if (updates.duration_minutes && !updates.duration) {
      updates.duration = `${updates.duration_minutes} min`
    }

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
      .select('id, assessment_type')
      .eq('id', req.params.id)
      .maybeSingle()

    if (!assessment) return res.status(404).json({ error: 'Assessment not found' })

    const csvText = req.file.buffer.toString('utf-8')
    const rows = parseCSV(csvText)

    if (rows.length === 0) {
      return res.status(400).json({ error: 'CSV file is empty or has invalid format' })
    }

    // ─── Row-level validation ───
    const errors = []
    const validAnswerKeys = ['A', 'B', 'C', 'D']

    const questions = rows.map((row, idx) => {
      const rowNum = idx + 2 // +2 because header is row 1, data starts at row 2
      const qText = row.question_text || row.question || ''

      // Validate question text
      if (!qText.trim()) {
        errors.push({ row: rowNum, column: 'question_text', value: '', message: 'Question text is required' })
      }

      // Validate options for MCQ type
      const qType = row.question_type || row.type || 'mcq'
      if (qType === 'mcq') {
        const optA = row.option_a || row.a || ''
        const optB = row.option_b || row.b || ''
        if (!optA.trim()) errors.push({ row: rowNum, column: 'option_a', value: '', message: 'Option A is required for MCQ' })
        if (!optB.trim()) errors.push({ row: rowNum, column: 'option_b', value: '', message: 'Option B is required for MCQ' })

        // Validate correct_answer
        const answer = (row.correct_answer || row.answer || '').toUpperCase().trim()
        if (!answer) {
          errors.push({ row: rowNum, column: 'correct_answer', value: row.correct_answer || '', message: 'Correct answer is required' })
        } else if (!validAnswerKeys.includes(answer)) {
          errors.push({ row: rowNum, column: 'correct_answer', value: answer, message: `Invalid answer "${answer}". Must be one of: A, B, C, D` })
        }
      }

      // Validate difficulty if present
      const validDifficulties = ['Easy', 'Intermediate', 'Hard']
      const difficulty = row.difficulty || 'Intermediate'
      if (row.difficulty && !validDifficulties.includes(difficulty)) {
        errors.push({ row: rowNum, column: 'difficulty', value: difficulty, message: `Invalid difficulty "${difficulty}". Must be: Easy, Intermediate, or Hard` })
      }

      return {
        assessment_id: req.params.id,
        question_text: qText,
        option_a: row.option_a || row.a || '',
        option_b: row.option_b || row.b || '',
        option_c: row.option_c || row.c || '',
        option_d: row.option_d || row.d || '',
        correct_answer: (row.correct_answer || row.answer || 'A').toUpperCase(),
        question_type: qType,
        difficulty: validDifficulties.includes(difficulty) ? difficulty : 'Intermediate',
        explanation: row.explanation || '',
        topic: row.topic || 'General',
        sort_order: idx
      }
    }).filter(q => q.question_text.trim().length > 0)

    // If there are validation errors, return them without inserting
    if (errors.length > 0) {
      return res.status(400).json({
        error: `Validation failed: ${errors.length} issue(s) found in CSV`,
        errors,
        validRowCount: questions.length,
        totalRows: rows.length
      })
    }

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

// ─── Topic Browsing Endpoints ───────────────────────────

// GET /api/assessments/browse/topics?type=aptitude — Get available topics for an assessment type
router.get('/browse/topics', async (req, res) => {
  try {
    const { type } = req.query
    const validTypes = ['aptitude', 'coding', 'communication', 'technical_reasoning']
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({ error: 'Valid assessment type is required' })
    }

    // Get assessments of this type that are available
    const { data: assessments } = await supabaseAdmin
      .from('assessments')
      .select('id')
      .eq('assessment_type', type)
      .eq('status', 'available')

    if (!assessments || assessments.length === 0) {
      return res.json({ topics: [] })
    }

    const ids = assessments.map(a => a.id)
    const { data: questions } = await supabaseAdmin
      .from('questions')
      .select('topic, difficulty')
      .in('assessment_id', ids)

    // Aggregate topics and their difficulties
    const topicMap = {}
    ;(questions || []).forEach(q => {
      const topic = q.topic || 'General'
      if (!topicMap[topic]) topicMap[topic] = { count: 0, difficulties: new Set() }
      topicMap[topic].count++
      topicMap[topic].difficulties.add(q.difficulty || 'Intermediate')
    })

    const topics = Object.entries(topicMap).map(([name, data]) => ({
      name,
      question_count: data.count,
      difficulties: [...data.difficulties]
    })).sort((a, b) => b.question_count - a.question_count)

    res.json({ topics })
  } catch (err) {
    console.error('Browse topics error:', err)
    res.status(500).json({ error: 'Failed to fetch topics' })
  }
})

// GET /api/assessments/browse/filter?type=aptitude&topic=Arrays&difficulty=Hard
// Returns matching assessments for the student flow
router.get('/browse/filter', async (req, res) => {
  try {
    const { type, topic, difficulty } = req.query
    const validTypes = ['aptitude', 'coding', 'communication', 'technical_reasoning']
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({ error: 'Valid assessment type is required' })
    }

    let query = supabaseAdmin
      .from('assessments')
      .select('*')
      .eq('assessment_type', type)
      .eq('status', 'available')
      .order('created_at', { ascending: false })

    if (difficulty) query = query.eq('difficulty', difficulty)

    const { data: assessments, error } = await query
    if (error) return res.status(400).json({ error: error.message })

    let results = assessments || []

    // If topic filter, only include assessments that have questions with that topic
    if (topic) {
      const ids = results.map(a => a.id)
      if (ids.length > 0) {
        const { data: questions } = await supabaseAdmin
          .from('questions')
          .select('assessment_id')
          .in('assessment_id', ids)
          .eq('topic', topic)

        const matchingIds = new Set((questions || []).map(q => q.assessment_id))
        results = results.filter(a => matchingIds.has(a.id))
      }
    }

    // For students: attach attempt info
    const profile = req.user.profile
    if (profile.role === 'student') {
      const { data: studentAttempts } = await supabaseAdmin
        .from('attempts')
        .select('assessment_id, status, invalidated')
        .eq('user_id', req.user.id)
        .eq('invalidated', false)

      const attemptCountMap = {}
      const inProgressMap = {}
      ;(studentAttempts || []).forEach(a => {
        if (a.status !== 'in_progress') {
          attemptCountMap[a.assessment_id] = (attemptCountMap[a.assessment_id] || 0) + 1
        }
        if (a.status === 'in_progress') inProgressMap[a.assessment_id] = true
      })

      // Filter by target audience
      const now = new Date()
      results = results.filter(a => {
        if (a.start_time && now < new Date(a.start_time)) return false
        if (a.end_time && now > new Date(a.end_time)) return false
        if (!a.open_to_all) {
          if (a.target_departments?.length > 0 && !a.target_departments.includes(profile.department)) return false
          if (a.target_years?.length > 0 && !a.target_years.includes(profile.year)) return false
          if (a.target_sections?.length > 0 && !a.target_sections.includes(profile.section || profile.division)) return false
        }
        return true
      }).map(a => ({
        ...a,
        attempts_used: attemptCountMap[a.id] || 0,
        max_attempts: a.max_attempts || 1,
        has_in_progress: !!inProgressMap[a.id],
        can_attempt: (attemptCountMap[a.id] || 0) < (a.max_attempts || 1) || !!inProgressMap[a.id]
      }))
    }

    res.json({ assessments: results })
  } catch (err) {
    console.error('Browse filter error:', err)
    res.status(500).json({ error: 'Failed to filter assessments' })
  }
})

// ─── POST /api/assessments/:id/upload-coding-csv — Upload coding problems via CSV ───
const REQUIRED_CODING_COLUMNS = [
  'title', 'description', 'input_format', 'output_format', 'constraints',
  'sample_input', 'sample_output', 'explanation', 'difficulty', 'topic',
  'time_limit', 'memory_limit', 'language', 'hidden_test_cases'
]
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard']

router.post('/:id/upload-coding-csv', roleGuard('admin', 'manager'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'CSV file is required' })

    // Verify assessment exists
    const { data: assessment } = await supabaseAdmin
      .from('assessments')
      .select('id, category')
      .eq('id', req.params.id)
      .maybeSingle()

    if (!assessment) return res.status(404).json({ error: 'Assessment not found' })

    const csvText = req.file.buffer.toString('utf-8')
    const lines = csvText.trim().split('\n')
    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV file is empty or has only a header row' })
    }

    // 1. Validate header columns STRICTLY
    const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
    const missingCols = REQUIRED_CODING_COLUMNS.filter(col => !headers.includes(col))
    if (missingCols.length > 0) {
      return res.status(400).json({
        error: `Missing required columns: ${missingCols.join(', ')}`,
        expected_columns: REQUIRED_CODING_COLUMNS
      })
    }

    // 2. Parse and validate each row
    const successfulProblems = []
    const errors = []

    for (let i = 1; i < lines.length; i++) {
      const rowNum = i + 1 // 1-indexed for user display
      const values = parseCSVLine(lines[i])
      if (values.length === 0 || values.every(v => !v.trim())) continue // skip empty rows

      const row = {}
      headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim() })

      // --- Field validations ---

      // Required text fields
      if (!row.title) { errors.push({ row: rowNum, message: 'Missing title' }); continue }
      if (!row.description) { errors.push({ row: rowNum, message: 'Missing description' }); continue }
      if (!row.input_format) { errors.push({ row: rowNum, message: 'Missing input_format' }); continue }
      if (!row.output_format) { errors.push({ row: rowNum, message: 'Missing output_format' }); continue }
      if (!row.sample_input) { errors.push({ row: rowNum, message: 'Missing sample_input' }); continue }
      if (!row.sample_output) { errors.push({ row: rowNum, message: 'Missing sample_output' }); continue }

      // Difficulty
      const difficulty = (row.difficulty || '').toLowerCase()
      if (!VALID_DIFFICULTIES.includes(difficulty)) {
        errors.push({ row: rowNum, message: `Invalid difficulty "${row.difficulty}". Must be one of: ${VALID_DIFFICULTIES.join(', ')}` })
        continue
      }

      // Numeric fields
      const timeLimit = parseInt(row.time_limit)
      if (isNaN(timeLimit) || timeLimit <= 0) {
        errors.push({ row: rowNum, message: `Invalid time_limit "${row.time_limit}". Must be a positive integer (seconds)` })
        continue
      }
      const memoryLimit = parseInt(row.memory_limit)
      if (isNaN(memoryLimit) || memoryLimit <= 0) {
        errors.push({ row: rowNum, message: `Invalid memory_limit "${row.memory_limit}". Must be a positive integer (MB)` })
        continue
      }

      // Hidden test cases — must be valid JSON array
      let hiddenTestCases = []
      try {
        // Normalize: handle escaped quotes from CSV
        let jsonStr = row.hidden_test_cases || '[]'
        // Fix double-double-quotes from CSV encoding
        jsonStr = jsonStr.replace(/""/g, '"')
        hiddenTestCases = JSON.parse(jsonStr)
        if (!Array.isArray(hiddenTestCases)) {
          errors.push({ row: rowNum, message: 'hidden_test_cases must be a JSON array' })
          continue
        }
        if (hiddenTestCases.length === 0) {
          errors.push({ row: rowNum, message: 'hidden_test_cases array is empty — at least one test case required' })
          continue
        }
        // Validate each test case
        for (let t = 0; t < hiddenTestCases.length; t++) {
          const tc = hiddenTestCases[t]
          if (!tc.input && tc.input !== '') {
            errors.push({ row: rowNum, message: `hidden_test_cases[${t}] is missing "input" field` })
            break
          }
          if (!tc.output && tc.output !== '') {
            errors.push({ row: rowNum, message: `hidden_test_cases[${t}] is missing "output" field` })
            break
          }
        }
        // If we appended a test case error, skip this row
        if (errors.length > 0 && errors[errors.length - 1].row === rowNum) continue
      } catch (jsonErr) {
        errors.push({ row: rowNum, message: `hidden_test_cases JSON malformed: ${jsonErr.message}` })
        continue
      }

      // Languages
      const languages = (row.language || 'python,cpp,java')
        .split(',')
        .map(l => l.trim().toLowerCase())
        .filter(Boolean)

      // Normalize line endings in text fields
      const normalize = (str) => (str || '').replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim()

      // Build test_cases array: sample (visible) + hidden
      const allTestCases = [
        { input: normalize(row.sample_input), expected: normalize(row.sample_output), is_hidden: false },
        ...hiddenTestCases.map(tc => ({
          input: normalize(tc.input),
          expected: normalize(tc.output),
          is_hidden: true
        }))
      ]

      // Build question record (fits into existing `questions` table)
      successfulProblems.push({
        assessment_id: req.params.id,
        question_text: normalize(row.title) + '\n\n' + normalize(row.description),
        // Store structured coding data in the MCQ option fields (repurposed for coding)
        option_a: normalize(row.constraints),      // constraints
        option_b: normalize(row.input_format),      // input format
        option_c: normalize(row.output_format),     // output format
        option_d: normalize(row.explanation),        // explanation
        correct_answer: '',                          // not applicable for coding
        question_type: 'coding',
        difficulty: difficulty.charAt(0).toUpperCase() + difficulty.slice(1), // Capitalize
        topic: (row.topic || 'General').trim(),
        explanation: normalize(row.explanation),
        code_template: '',
        test_cases: allTestCases,
        sort_order: successfulProblems.length
      })
    }

    if (successfulProblems.length === 0) {
      return res.status(400).json({
        error: 'No valid coding problems found in CSV',
        failed: errors.length,
        errors
      })
    }

    // 3. Insert into database
    const { data, error: insertErr } = await supabaseAdmin
      .from('questions')
      .insert(successfulProblems)
      .select()

    if (insertErr) {
      console.error('Coding CSV insert error:', insertErr)
      return res.status(400).json({ error: insertErr.message })
    }

    // Update question count on assessment
    const { count: totalQ } = await supabaseAdmin
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('assessment_id', req.params.id)

    await supabaseAdmin
      .from('assessments')
      .update({ questions: totalQ || successfulProblems.length })
      .eq('id', req.params.id)

    res.status(201).json({
      message: `${successfulProblems.length} coding problem(s) uploaded successfully`,
      success: successfulProblems.length,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
      problems: (data || []).map(q => ({ id: q.id, title: q.question_text?.split('\n')[0] }))
    })
  } catch (err) {
    console.error('Coding CSV upload error:', err)
    res.status(500).json({ error: 'Failed to upload coding CSV' })
  }
})

export default router
