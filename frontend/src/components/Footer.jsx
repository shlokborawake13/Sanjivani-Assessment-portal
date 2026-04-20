import { GraduationCap, Mail, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="bg-primary text-on-primary">
      <div className="max-w-[1200px] mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
                <GraduationCap size={20} className="text-accent" />
              </div>
              <span className="text-lg font-semibold tracking-tight">Sanjivani CareerSpace</span>
            </div>
            <p className="text-sm text-primary-fixed-dim leading-relaxed">
              Precision in Intelligence. Dedicated to advancing ethical assessment and academic excellence.
            </p>
          </div>

          {/* Portal */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-accent mb-4">Portal</h4>
            <ul className="list-none p-0 m-0 flex flex-col gap-2.5">
              {['Dashboard', 'Assessments', 'Results', 'Performance'].map((item) => (
                <li key={item}>
                  <Link to={`/${item.toLowerCase()}`} className="text-sm text-primary-fixed-dim hover:text-white no-underline transition-colors duration-200">
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-accent mb-4">Company</h4>
            <ul className="list-none p-0 m-0 flex flex-col gap-2.5">
              {['Privacy Policy', 'Terms of Service', 'Careers', 'FAQ'].map((item) => (
                <li key={item}>
                  <a href="#" className="text-sm text-primary-fixed-dim hover:text-white no-underline transition-colors duration-200">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-accent mb-4">Contact</h4>
            <ul className="list-none p-0 m-0 flex flex-col gap-3">
              <li className="flex items-center gap-2 text-sm text-primary-fixed-dim">
                <Mail size={14} className="text-accent shrink-0" />
                assessments@sanjivani.edu
              </li>
              <li className="flex items-center gap-2 text-sm text-primary-fixed-dim">
                <MapPin size={14} className="text-accent shrink-0" />
                Sanjivani University, Kopargaon
              </li>
            </ul>
            <Link
              to="/support"
              className="inline-block mt-4 text-sm font-medium text-accent hover:text-white no-underline transition-colors duration-200"
            >
              Contact Support →
            </Link>
          </div>
        </div>

        <div className="mt-12 pt-8 text-center" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-xs text-primary-fixed-dim">
            © 2026 Sanjivani CareerSpace. Precision in Intelligence.
          </p>
        </div>
      </div>
    </footer>
  )
}
