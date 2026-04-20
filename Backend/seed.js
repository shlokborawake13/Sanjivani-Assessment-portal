import { supabaseAdmin } from './config/supabase.js'
import dotenv from 'dotenv'
dotenv.config()

async function seed() {
  console.log('🌱 Seeding database...')

  // Seed assessments
  const assessments = [
    {
      title: 'Aptitude Assessment',
      description: 'Quantitative reasoning, logical analysis, and verbal proficiency evaluation.',
      category: 'Aptitude',
      duration: '60 min',
      questions: 40,
      difficulty: 'Intermediate',
      status: 'available'
    },
    {
      title: 'Coding Proficiency',
      description: 'Data structures, algorithms, and problem-solving across multiple languages.',
      category: 'Coding',
      duration: '90 min',
      questions: 25,
      difficulty: 'Advanced',
      status: 'available'
    },
    {
      title: 'Communication Skills',
      description: 'Written expression, comprehension, and professional communication assessment.',
      category: 'Communication',
      duration: '45 min',
      questions: 30,
      difficulty: 'Beginner',
      status: 'available'
    },
    {
      title: 'Technical Reasoning',
      description: 'Core engineering concepts and analytical thinking evaluation.',
      category: 'Technical',
      duration: '75 min',
      questions: 35,
      difficulty: 'Intermediate',
      status: 'coming_soon'
    }
  ]

  const { error: assessmentError } = await supabaseAdmin
    .from('assessments')
    .upsert(assessments, { onConflict: 'title' })

  if (assessmentError) {
    console.error('Assessment seed error:', assessmentError)
  } else {
    console.log('✅ Assessments seeded')
  }

  // Seed announcements
  const announcements = [
    {
      title: 'Mid-Semester Assessment Schedule',
      message: 'Aptitude and Coding assessments are now open for April cycle. Complete before April 20th.',
      type: 'important'
    },
    {
      title: 'New Communication Module Released',
      message: 'Practice the latest business communication scenarios in the training section.',
      type: 'info'
    },
    {
      title: 'Performance Reports Updated',
      message: 'March performance analytics are now available. Check your progress trends.',
      type: 'update'
    }
  ]

  const { error: announcementError } = await supabaseAdmin
    .from('announcements')
    .upsert(announcements, { onConflict: 'title' })

  if (announcementError) {
    console.error('Announcement seed error:', announcementError)
  } else {
    console.log('✅ Announcements seeded')
  }

  console.log('🌱 Seeding complete!')
  process.exit(0)
}

seed().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
